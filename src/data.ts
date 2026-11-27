import type { Agent } from '@atproto/api'
import { COLLECTION_DAY, COLLECTION_PROFILE, YEAR } from './config'

export type Units = 'mi' | 'km'

export interface Profile {
  name: string
  units: Units
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

/** Removes every calendar record (all years) + profile. Bluesky posts are left alone. */
export async function deleteAll(agent: Agent, did: string) {
  for (const collection of [COLLECTION_DAY, COLLECTION_PROFILE]) {
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
