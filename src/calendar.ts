import { MI_TO_KM, SCHEDULES, YEAR, type Plan } from './config'
import type { DayRecord, Units } from './data'

/** "Now", overridable with ?date=2026-12-05 for previewing the calendar. */
export function now(): Date {
  const override = new URLSearchParams(location.search).get('date')
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    const [y, m, d] = override.split('-').map(Number)
    const real = new Date()
    return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds())
  }
  return new Date()
}

/** Midnight local time on Dec `day`. */
export const doorOpensAt = (day: number) => new Date(YEAR, 11, day)

/** Today's door number (1–24), 0 before Dec 1, 25 after Dec 24. */
export function currentDay(at = now()): number {
  if (at < doorOpensAt(1)) return 0
  if (at >= doorOpensAt(25)) return 25
  return at.getDate()
}

export type DoorState = 'locked' | 'today' | 'open' | 'done'

export function doorState(day: number, done: Map<number, DayRecord>, today = currentDay()): DoorState {
  if (done.has(day)) return 'done'
  if (day > today) return 'locked'
  if (day === today) return 'today'
  return 'open'
}

/** The plan whose suggestions are showing (team's plan, or your own when solo). */
let activePlan: Plan = 'easy'
export const setPlan = (p: Plan) => (activePlan = SCHEDULES[p] ? p : 'easy')
export const getPlan = () => activePlan
export const target = (day: number) => SCHEDULES[activePlan].find((s) => s.day === day)!

// ── units & formatting ──
export const metersFrom = (value: number, units: Units) => value * (units === 'mi' ? MI_TO_KM : 1) * 1000
export const toUnits = (meters: number, units: Units) => meters / 1000 / (units === 'mi' ? MI_TO_KM : 1)
export const milesToUnits = (miles: number, units: Units) => (units === 'mi' ? miles : miles * MI_TO_KM)

export function fmtDist(value: number, units: Units, withUnit = true) {
  const n = Math.round(value * 100) / 100
  const s = Number.isInteger(n) ? String(n) : n.toFixed(n * 10 === Math.round(n * 10) ? 1 : 2)
  return withUnit ? `${s} ${units}` : s
}

export function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`
}

export function fmtPace(meters: number, sec: number, units: Units) {
  const dist = toUnits(meters, units)
  if (!dist || !sec) return ''
  const p = sec / dist
  return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')} /${units}`
}

/** Parses "25", "25:30", "1:05:30" into seconds. */
export function parseDuration(input: string): number | undefined {
  const parts = input.trim().split(':').map((p) => p.trim())
  if (!parts[0]) return undefined
  if (parts.some((p) => !/^\d+$/.test(p)) || parts.length > 3) return NaN
  const nums = parts.map(Number)
  if (nums.length === 1) return nums[0] * 60
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  return nums[0] * 3600 + nums[1] * 60 + nums[2]
}

// ── stats ──
export interface Stats {
  doors: number
  streak: number
  meters: number
}

export function stats(done: Map<number, DayRecord>, today = currentDay()): Stats {
  let meters = 0
  for (const r of done.values()) meters += r.distanceMeters
  // Streak: consecutive completed days ending today (or yesterday if today isn't done yet).
  let d = Math.min(today, 24)
  if (d >= 1 && !done.has(d) && today <= 24) d--
  let streak = 0
  while (d >= 1 && done.has(d)) {
    streak++
    d--
  }
  return { doors: done.size, streak, meters }
}
