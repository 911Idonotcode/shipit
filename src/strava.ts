import { STRAVA_WORKER_URL, YEAR } from './config'

/** Strava tokens live only in this browser (per device). */
const KEY = 'runadvent:strava'
const STATE_KEY = 'runadvent:strava-state'

interface Tokens {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete: string
}

export interface Activity {
  id: number
  name: string
  type: string
  distance: number // meters
  moving_time: number // seconds
  start_date_local: string
}

const worker = () => STRAVA_WORKER_URL.replace(/\/*$/, '')
export const stravaEnabled = () => !!STRAVA_WORKER_URL

function read(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}
const write = (t: Tokens | null) => (t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY))

export const stravaAthlete = () => read()?.athlete ?? null
export const stravaConnected = () => !!read()

/** Sends the runner to Strava's consent screen. */
export function connectStrava() {
  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_KEY, state)
  const back = location.origin + location.pathname
  location.href = `${worker()}/connect?state=${state}&return=${encodeURIComponent(back)}`
}

/** Call on page load: picks up #strava=… / #strava_error=… after the redirect. Returns a message to show, if any. */
export function handleStravaReturn(): { ok: boolean; msg: string } | null {
  const h = new URLSearchParams(location.hash.slice(1))
  const err = h.get('strava_error')
  const payload = h.get('strava')
  if (!err && !payload) return null
  history.replaceState(null, '', location.pathname + location.search)
  if (err) return { ok: false, msg: err }
  try {
    const bin = atob(payload!.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    const expected = sessionStorage.getItem(STATE_KEY)
    sessionStorage.removeItem(STATE_KEY)
    if (!expected || data.state !== expected) return { ok: false, msg: 'Strava connection expired. Please try again.' }
    write({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, athlete: data.athlete })
    return { ok: true, msg: 'Strava connected 🧡' }
  } catch {
    return { ok: false, msg: 'Strava connection failed. Please try again.' }
  }
}

async function accessToken(): Promise<string> {
  const t = read()
  if (!t) throw new Error('Strava is not connected')
  if (t.expires_at - 120 > Date.now() / 1000) return t.access_token
  const r = await fetch(`${worker()}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  })
  if (!r.ok) {
    write(null)
    throw new Error('Strava connection expired. Reconnect it in Settings.')
  }
  const fresh = await r.json()
  write({ ...t, ...fresh })
  return fresh.access_token
}

const ON_FOOT = /run|walk|hike|wheelchair/i

/** Runs/walks/hikes that started on Dec `day` (runner's local time). */
export async function activitiesOn(day: number): Promise<Activity[]> {
  const from = new Date(YEAR, 11, day)
  const to = new Date(YEAR, 11, day + 1)
  // Pad the window by a day each side; filter by local start date below (Strava's local time is authoritative).
  const after = Math.floor(from.getTime() / 1000) - 86400
  const before = Math.floor(to.getTime() / 1000) + 86400
  const r = await fetch(`${worker()}/activities?after=${after}&before=${before}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  })
  if (r.status === 401) {
    write(null)
    throw new Error('Strava connection expired. Reconnect it in Settings.')
  }
  if (!r.ok) throw new Error('Could not reach Strava. Try again in a moment.')
  const list: Activity[] = await r.json()
  const ymd = `${YEAR}-12-${String(day).padStart(2, '0')}`
  return list.filter((a) => a.start_date_local.startsWith(ymd) && ON_FOOT.test(a.type))
}

export async function disconnectStrava() {
  try {
    await fetch(`${worker()}/disconnect`, { method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}` } })
  } catch {
    /* forget locally regardless */
  }
  write(null)
}
