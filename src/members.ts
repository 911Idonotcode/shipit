import { COLLECTION_DAY, COLLECTION_PROFILE, YEAR } from './config'
import { stats } from './calendar'
import type { DayRecord, Profile, Team } from './data'

/**
 * Team boards: runners who share a team with you, discovered via the Bluesky
 * relay's public collection index (everyone with a calendar profile), then
 * filtered by the team URIs on their profile. No server of our own needed.
 */
const RELAY = 'https://relay1.us-east.bsky.network'
const APPVIEW = 'https://public.api.bsky.app'
const PLC = 'https://plc.directory'
const MAX_MEMBERS = 500

export interface Member {
  did: string
  handle: string
  name: string
  avatar?: string
  doors: number
  streak: number
  meters: number
  isYou: boolean
  teams: string[]
}

async function getJson(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

/** All accounts that have a calendar profile record. */
async function memberDids(): Promise<string[]> {
  const dids: string[] = []
  let cursor = ''
  do {
    const q = new URLSearchParams({ collection: COLLECTION_PROFILE, limit: '500' })
    if (cursor) q.set('cursor', cursor)
    const res = await getJson(`${RELAY}/xrpc/com.atproto.sync.listReposByCollection?${q}`)
    for (const r of res.repos ?? []) dids.push(r.did)
    cursor = res.cursor ?? ''
  } while (cursor && dids.length < MAX_MEMBERS)
  return dids
}

/** The server (PDS) that hosts an account's records. */
async function pdsOf(did: string): Promise<string> {
  const doc = did.startsWith('did:web:')
    ? await getJson(`https://${did.slice(8)}/.well-known/did.json`)
    : await getJson(`${PLC}/${did}`)
  const svc = (doc.service ?? []).find((s: { id: string }) => s.id.endsWith('#atproto_pds'))
  if (!svc) throw new Error(`no PDS for ${did}`)
  return svc.serviceEndpoint
}

async function readMember(did: string, myTeams: Set<string> | 'all') {
  const pds = await pdsOf(did)
  const xrpc = (m: string, q: Record<string, string>) => getJson(`${pds}/xrpc/${m}?${new URLSearchParams(q)}`)
  const prof = (await xrpc('com.atproto.repo.getRecord', { repo: did, collection: COLLECTION_PROFILE, rkey: 'self' })).value as Profile
  const shared = myTeams === 'all' ? (prof.teams ?? []) : (prof.teams ?? []).filter((t) => myTeams.has(t))
  if (myTeams !== 'all') {
    if (prof.showOnBoard === false) return null
    if (!shared.length) return null // not a teammate: don't read their runs
  }
  const days = new Map<number, DayRecord>()
  let cursor = ''
  do {
    const q: Record<string, string> = { repo: did, collection: COLLECTION_DAY, limit: '100' }
    if (cursor) q.cursor = cursor
    const res = await xrpc('com.atproto.repo.listRecords', q)
    for (const r of res.records ?? []) {
      const v = r.value as DayRecord
      if (v.year === YEAR && v.day >= 1 && v.day <= 24 && v.distanceMeters > 0) days.set(v.day, v)
    }
    cursor = res.cursor ?? ''
  } while (cursor)
  return { did, name: prof.name, days, teams: shared }
}

/** Bluesky handles + avatars, 25 at a time. */
async function bskyProfiles(dids: string[]) {
  const out = new Map<string, { handle: string; displayName?: string; avatar?: string }>()
  for (let i = 0; i < dids.length; i += 25) {
    const q = new URLSearchParams()
    dids.slice(i, i + 25).forEach((d) => q.append('actors', d))
    try {
      const res = await getJson(`${APPVIEW}/xrpc/app.bsky.actor.getProfiles?${q}`)
      for (const p of res.profiles ?? []) out.set(p.did, p)
    } catch {
      /* names still come from the calendar profile */
    }
  }
  return out
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

/**
 * Loads the board. `self` is the signed-in runner's own (already loaded) data,
 * so they always appear even if the network index hasn't caught up yet.
 */
export async function loadMembers(self: { did: string; profile: Profile; days: Map<number, DayRecord> }): Promise<Member[]> {
  const myTeams = new Set(self.profile.teams ?? [])
  const me = { did: self.did, name: self.profile.name, days: self.days, teams: [...myTeams] }
  if (!myTeams.size) return finish([me], self.did) // running solo: nothing to look up
  const dids = (await memberDids()).filter((d) => d !== self.did)
  const others = (await pool(dids, 6, (d) => readMember(d, myTeams).catch(() => null))).filter((m) => m !== null)
  return finish([me, ...others], self.did)
}

async function finish(all: { did: string; name: string; days: Map<number, DayRecord>; teams: string[] }[], selfDid: string) {
  const bsky = await bskyProfiles(all.map((m) => m.did))
  return all
    .map((m) => {
      const s = stats(m.days)
      const p = bsky.get(m.did)
      return {
        did: m.did,
        handle: p?.handle ?? '',
        name: (m.name || p?.displayName || p?.handle || 'Runner').slice(0, 40),
        avatar: p?.avatar,
        doors: s.doors,
        streak: s.streak,
        meters: s.meters,
        isYou: m.did === selfDid,
        teams: m.teams,
      }
    })
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name))
}

/** Reads a team record from its creator's account. */
export async function loadTeam(uri: string): Promise<Team | null> {
  try {
    const [, , did, collection, rkey] = uri.split('/')
    const pds = await pdsOf(did)
    const res = await getJson(`${pds}/xrpc/com.atproto.repo.getRecord?${new URLSearchParams({ repo: did, collection, rkey })}`)
    const v = res.value as Team
    return { name: String(v.name || 'Team').slice(0, 40), emoji: String(v.emoji || '🏃').slice(0, 8), createdAt: v.createdAt }
  } catch {
    return null
  }
}

/** Admin overview: every participant (including solo runners) and their teams. */
export async function loadEveryone(selfDid: string): Promise<Member[]> {
  const dids = [...new Set([selfDid, ...(await memberDids())])]
  const all = (await pool(dids, 6, (d) => readMember(d, 'all').catch(() => null))).filter((m) => m !== null)
  return finish(all, selfDid)
}
