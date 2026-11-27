import type { Agent } from '@atproto/api'
import { COLLECTION_DAY, COLLECTION_PROFILE, COLLECTION_ROSTER, COLLECTION_TEAM, YEAR, type Plan } from './config'

export type Units = 'mi' | 'km'

export interface Profile {
  name: string
  units: Units
  /** Listed on your team boards (default: yes). */
  showOnBoard?: boolean
  /** at:// URIs of the teams this runner belongs to. */
  teams?: string[]
  /** Plan to follow when not on a team. */
  plan?: Plan
  /** Teams the runner chose to leave (overrides an organizer add). */
  leftTeams?: string[]
  /** User ticked the "own risk / health disclaimer" box. */
  acceptedTerms: boolean
  createdAt: string
}

export interface DayRecord {
  year: number
  day: number
  /** Distance always stored in meters so units can change later. */
  distanceMeters: number
  /** Optional moving time. */
  durationSeconds?: number
  note?: string
  /** Strava activity this was imported from, if any. */
  stravaActivityId?: number
  /** URI of the Bluesky post, if the runner shared it. */
  postUri?: string
  completedAt: string
}

const dayKey = (day: number) => `${YEAR}-${String(day).padStart(2, '0')}`

export async function getProfile(agent: Agent, did: string): Promise<Profile | null> {
  try {
    const res = await agent.com.atproto.repo.getRecord({ repo: did, collection: COLLECTION_PROFILE, rkey: 'self' })
    return res.data.value as unknown as Profile
  } catch {
    return null
  }
}

export async function saveProfile(agent: Agent, did: string, profile: Profile) {
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION_PROFILE,
    rkey: 'self',
    record: { $type: COLLECTION_PROFILE, ...profile },
    validate: false,
  })
}

export async function listDays(agent: Agent, did: string): Promise<Map<number, DayRecord>> {
  const out = new Map<number, DayRecord>()
  let cursor: string | undefined
  do {
    const res = await agent.com.atproto.repo.listRecords({ repo: did, collection: COLLECTION_DAY, limit: 100, cursor })
    for (const r of res.data.records) {
      const v = r.value as unknown as DayRecord
      if (v.year === YEAR && v.day >= 1 && v.day <= 24) out.set(v.day, v)
    }
    cursor = res.data.cursor
  } while (cursor)
  return out
}

export async function saveDay(agent: Agent, did: string, rec: DayRecord) {
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION_DAY,
    rkey: dayKey(rec.day),
    record: { $type: COLLECTION_DAY, ...rec },
    validate: false,
  })
}

export async function deleteDay(agent: Agent, did: string, day: number) {
  await agent.com.atproto.repo.deleteRecord({ repo: did, collection: COLLECTION_DAY, rkey: dayKey(day) })
}

/** Removes every calendar record (all years), profile and teams you created. Bluesky posts are left alone. */
export async function deleteAll(agent: Agent, did: string) {
  for (const collection of [COLLECTION_DAY, COLLECTION_PROFILE, COLLECTION_TEAM, COLLECTION_ROSTER]) {
    let cursor: string | undefined
    do {
      const res = await agent.com.atproto.repo.listRecords({ repo: did, collection, limit: 100, cursor })
      const writes = res.data.records.map((r) => ({
        $type: 'com.atproto.repo.applyWrites#delete' as const,
        collection,
        rkey: r.uri.split('/').pop()!,
      }))
      if (writes.length) await agent.com.atproto.repo.applyWrites({ repo: did, writes })
      cursor = res.data.cursor
    } while (cursor)
  }
}

// ── teams ──
export interface Team {
  name: string
  emoji: string
  /** Training plan the team follows (default: easy). */
  level?: Plan
  createdAt: string
}

/** Team records live in the creator's repo; the at:// URI is the team's identity. */
export async function createTeam(agent: Agent, did: string, team: Team): Promise<string> {
  const rkey = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const res = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION_TEAM,
    rkey,
    record: { $type: COLLECTION_TEAM, ...team },
    validate: false,
  })
  return res.data.uri
}

/** The creator can update their own team record (e.g. change its plan). */
export async function updateTeam(agent: Agent, uri: string, team: Team) {
  const [, , did, , rkey] = uri.split('/')
  await agent.com.atproto.repo.putRecord({ repo: did, collection: COLLECTION_TEAM, rkey, record: { $type: COLLECTION_TEAM, ...team }, validate: false })
}

/** Short invite code: "<did>~<rkey>" ⇄ at://<did>/<team collection>/<rkey> */
export const teamCode = (uri: string) => {
  const [, , did, , rkey] = uri.split('/')
  return `${did}~${rkey}`
}
export const teamUri = (code: string) => {
  const i = code.indexOf('~')
  if (i < 0) return null
  const did = code.slice(0, i)
  const rkey = code.slice(i + 1)
  if (!/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(did) || !/^[A-Za-z0-9._:~-]{1,512}$/.test(rkey)) return null
  return `at://${did}/${COLLECTION_TEAM}/${rkey}`
}

// ── organizer roster ──
// Runners' team lists live in their own repos, which only they can write.
// The organizer keeps adds/removes in a roster record in *their* repo, and
// the app applies it everywhere. (App-level control: records are public.)
export interface RosterEntry {
  team: string
  did: string
}
export interface Roster {
  add: RosterEntry[]
  remove: RosterEntry[]
  updatedAt: string
}
export const emptyRoster = (): Roster => ({ add: [], remove: [], updatedAt: '' })

const same = (a: RosterEntry, b: RosterEntry) => a.team === b.team && a.did === b.did

/** The teams someone is really on, once the organizer's roster is applied. */
export function effectiveTeams(did: string, profile: Pick<Profile, 'teams' | 'leftTeams'> | null, roster: Roster): string[] {
  const added = roster.add.filter((e) => e.did === did).map((e) => e.team)
  const removed = new Set(roster.remove.filter((e) => e.did === did).map((e) => e.team))
  const left = new Set(profile?.leftTeams ?? [])
  return [...new Set([...(profile?.teams ?? []), ...added])].filter((t) => !removed.has(t) && !left.has(t))
}

export const isRemoved = (roster: Roster, did: string, team: string) => roster.remove.some((e) => same(e, { did, team }))

/** Returns a new roster with `did` added to / removed from `team`. */
export function rosterSet(roster: Roster, did: string, team: string, member: boolean): Roster {
  const e = { did, team }
  return {
    add: [...roster.add.filter((x) => !same(x, e)), ...(member ? [e] : [])],
    remove: [...roster.remove.filter((x) => !same(x, e)), ...(member ? [] : [e])],
    updatedAt: new Date().toISOString(),
  }
}

export async function saveRoster(agent: Agent, did: string, roster: Roster) {
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION_ROSTER,
    rkey: 'self',
    record: { $type: COLLECTION_ROSTER, ...roster },
    validate: false,
  })
}
