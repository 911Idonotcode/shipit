// Dev-only fake Bluesky session so the signed-in UI can be previewed locally
// with http://127.0.0.1:5173/?demo&date=2026-12-09 — never included in production builds.
import type { Session } from './auth'

export function demoSession(): Session {
  const records = new Map<string, unknown>()
  const key = (c: string, r: string) => `${c}/${r}`
  const date = new URLSearchParams(location.search).get('date') ?? ''
  const upTo = date.slice(5, 7) === '12' ? Number(date.slice(8)) - 1 : 0
  for (let d = 1; d <= upTo; d++) {
    if (d === 4) continue
    records.set(key('io.github.911idonotcode.runadvent.day', `2026-${String(d).padStart(2, '0')}`), {
      year: 2026, day: d, distanceMeters: 1609 * (1 + (d % 4)), durationSeconds: 600 * (1 + (d % 4)), completedAt: new Date().toISOString(),
    })
  }
  const teamNames = [{ name: 'Hill Hustlers', emoji: '🏔️' }, { name: 'Cocoa Crew', emoji: '☕' }]
  teamNames.forEach((t, i) => records.set(key('io.github.911idonotcode.runadvent.team', `tdemo${i + 1}`), { ...t, createdAt: '' }))
  if (new URLSearchParams(location.search).has('demo-teams')) {
    records.set(key('io.github.911idonotcode.runadvent.profile', 'self'), {
      name: 'Andres Castañeda', units: 'mi', acceptedTerms: true, createdAt: '',
      teams: ['at://did:plc:demo/io.github.911idonotcode.runadvent.team/tdemo1', 'at://did:plc:demo/io.github.911idonotcode.runadvent.team/tdemo2'],
    })
  }
  const repo = {
    getRecord: async ({ collection, rkey }: any) => {
      const v = records.get(key(collection, rkey))
      if (!v) throw new Error('not found')
      return { data: { value: v } }
    },
    putRecord: async ({ collection, rkey, record }: any) => {
      records.set(key(collection, rkey), record)
      return { data: { uri: `at://did:plc:demo/${collection}/${rkey}` } }
    },
    deleteRecord: async ({ collection, rkey }: any) => void records.delete(key(collection, rkey)),
    listRecords: async ({ collection }: any) => ({
      data: {
        records: [...records].filter(([k]) => k.startsWith(collection + '/')).map(([k, value]) => ({ uri: `at://did:plc:demo/${k}`, value })),
      },
    }),
    applyWrites: async ({ writes }: any) => writes.forEach((w: any) => records.delete(key(w.collection, w.rkey))),
  }
  const agent = {
    com: { atproto: { repo, identity: { resolveHandle: async () => ({ data: { did: 'did:plc:host' } }) } } },
    getProfile: async () => ({ data: { displayName: 'Andres Castañeda', handle: 'demo.bsky.social' } }),
    uploadBlob: async () => ({ data: { blob: {} } }),
    post: async () => ({ uri: 'at://did:plc:demo/app.bsky.feed.post/3demo' }),
  }
  return { did: 'did:plc:demo', agent: agent as any, oauth: { signOut: async () => {} } as any }
}

export const DEMO_TEAMS = ['at://did:plc:demo/io.github.911idonotcode.runadvent.team/tdemo1', 'at://did:plc:demo/io.github.911idonotcode.runadvent.team/tdemo2']

const NAMES = ['Priya N.', 'Marcus Lee', 'Jo', 'Sam Okafor', 'Lena Fischer', 'Dev Patel', 'Rosa M.', 'Tomás Ruiz', 'Kai', 'Bea Thompson', 'Noor A.', 'Chris P.']

function people() {
  return NAMES.map((name, i) => ({
    did: `did:plc:demo${i}`,
    handle: `${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.bsky.social`,
    name,
    doors: (i * 7) % 11,
    streak: [5, 0, 2, 1, 8, 0, 3, 0, 2, 0, 4, 0][i],
    meters: ((i * 7) % 11) * 4200,
    isYou: false,
    // first 5 on team 1, 4–7 on team 2 (4 is on both), the rest solo
    teams: [...(i < 5 ? [DEMO_TEAMS[0]] : []), ...(i >= 4 && i < 8 ? [DEMO_TEAMS[1]] : [])],
  }))
}

export function demoMembers(selfDid: string, myTeams: string[]) {
  return [
    { did: selfDid, handle: 'acastanedalife.bsky.social', name: 'Andres Castañeda', doors: 0, streak: 0, meters: 0, isYou: true, teams: myTeams },
    ...people()
      .map((p) => ({ ...p, teams: p.teams.filter((t) => myTeams.includes(t)) }))
      .filter((p) => p.teams.length),
  ]
}

export function demoEveryone(selfDid: string, myTeams: string[]) {
  return [{ did: selfDid, handle: 'acastanedalife.bsky.social', name: 'Andres Castañeda', doors: 0, streak: 0, meters: 0, isYou: true, teams: myTeams }, ...people()]
}
