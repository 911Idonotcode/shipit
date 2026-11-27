// ─────────────────────────────────────────────────────────────
// Everything you'd want to tweak lives in this file.
// ─────────────────────────────────────────────────────────────

/** The calendar's name, used in titles, posts and invites. */
export const APP_NAME = '24 Days of Run-Mas'

/** Your Bluesky handle — shown as a small "made by" credit. */
export const HOST_HANDLE = 'acastanedalife.bsky.social'

/**
 * Bluesky handles that see the Admin overview (everyone, totals, teams).
 * Note: all calendar records are public on the AT Protocol network, so this
 * is a convenience view, not a security boundary.
 */
export const ADMIN_HANDLES = [HOST_HANDLE]

/** Hashtag added to every Bluesky post (without the #). */
export const HASHTAG = 'runadvent'

/** The December this calendar runs in. */
export const YEAR = 2026

export type Plan = 'easy' | 'intermediate'
export type Workout = 'easy' | 'long' | 'hills' | 'intervals' | 'tempo'
export interface DayPlan {
  day: number
  miles: number
  title: string
  kind: Workout
  /** Step-by-step for workouts (shown on the door). */
  how?: string
}

export const PLANS: Record<Plan, { label: string; range: string; blurb: string }> = {
  easy: { label: 'Easy going', range: '1–5 mi weekdays · 7 on Saturdays', blurb: '1–5 miles on weekdays, 7 on Saturdays, short and varied on Sundays. Run or walk, any level.' },
  intermediate: { label: 'Intermediate', range: '2–6 mi weekdays · up to 10 on Saturdays', blurb: '2–6 miles on weekdays with easy runs, hill repeats and intervals. Saturdays build to 10; Sundays stay low.' },
}

/**
 * The 24 doors for each plan. Distances are in miles (km is converted
 * automatically). Saturdays (Dec 5, 12, 19 in 2026) are the long days; Sundays stay short.
 * Change titles/distances freely.
 */
export const SCHEDULES: Record<Plan, DayPlan[]> = {
  easy: [
    { day: 1, miles: 1, title: 'First door jitters', kind: 'easy' },
    { day: 2, miles: 2, title: 'Cocoa cruise', kind: 'easy' },
    { day: 3, miles: 1.5, title: 'Twinkle trot', kind: 'easy' },
    { day: 4, miles: 3, title: 'Sweater weather', kind: 'easy' },
    { day: 5, miles: 7, title: 'Gingerbread long haul', kind: 'long' },
    { day: 6, miles: 3, title: 'Lazy Sunday', kind: 'easy' },
    { day: 7, miles: 1, title: 'Easy elf miles', kind: 'easy' },
    { day: 8, miles: 2.5, title: 'Peppermint pace', kind: 'easy' },
    { day: 9, miles: 3, title: 'Frosty miles', kind: 'easy' },
    { day: 10, miles: 1.5, title: 'Mitten mile-and-a-half', kind: 'easy' },
    { day: 11, miles: 3, title: 'Friday night lights', kind: 'easy' },
    { day: 12, miles: 7, title: 'Lights tour long one', kind: 'long' },
    { day: 13, miles: 2, title: 'Sunday snow globe loop', kind: 'easy' },
    { day: 14, miles: 1, title: 'Recovery jingle', kind: 'easy' },
    { day: 15, miles: 3, title: 'Tinsel trot', kind: 'easy' },
    { day: 16, miles: 2, title: 'Candy cane cadence', kind: 'easy' },
    { day: 17, miles: 3.5, title: 'Reindeer games', kind: 'easy' },
    { day: 18, miles: 1.5, title: 'Wrap-it-up walk', kind: 'easy' },
    { day: 19, miles: 7, title: 'The big one', kind: 'long' },
    { day: 20, miles: 4, title: 'Longest night easy one', kind: 'easy' },
    { day: 21, miles: 2, title: 'Solstice shakeout', kind: 'easy' },
    { day: 22, miles: 3, title: 'Last-minute shopping run', kind: 'easy' },
    { day: 23, miles: 1, title: 'Christmas Eve Eve', kind: 'easy' },
    { day: 24, miles: 5, title: 'Sleigh the finale', kind: 'easy' },
  ],
  intermediate: [
    { day: 1, miles: 2, title: 'First door shakeout', kind: 'easy' },
    { day: 2, miles: 3, title: 'Jingle intervals', kind: 'intervals', how: '1 mi easy warm-up · 6 × 1 min quick with 2 min easy jog between · easy jog to finish' },
    { day: 3, miles: 4, title: 'Cocoa cruise', kind: 'easy' },
    { day: 4, miles: 2, title: 'Friday recovery', kind: 'easy' },
    { day: 5, miles: 8, title: 'Gingerbread long run', kind: 'long', how: 'Steady, conversational pace the whole way. Walk breaks are fine!' },
    { day: 6, miles: 3, title: 'Sunday stroll-jog', kind: 'easy' },
    { day: 7, miles: 2, title: 'Easy elf miles', kind: 'easy' },
    { day: 8, miles: 3, title: 'Snowy summit repeats', kind: 'hills', how: '1 mi easy warm-up · 6 × 45 sec strong uphill, walk or jog back down · easy jog to finish' },
    { day: 9, miles: 5, title: 'Frosty easy miles', kind: 'easy' },
    { day: 10, miles: 5, title: 'Reindeer intervals', kind: 'intervals', how: '1 mi easy warm-up · 5 × 3 min comfortably hard with 2 min easy jog between · 1 mi easy cool-down' },
    { day: 11, miles: 2, title: 'Friday night lights', kind: 'easy' },
    { day: 12, miles: 9, title: 'Lights tour long run', kind: 'long', how: 'Easy pace; finish the last mile a little quicker if you feel good' },
    { day: 13, miles: 2, title: 'Sunday snow globe loop', kind: 'easy' },
    { day: 14, miles: 2, title: 'Recovery jingle', kind: 'easy' },
    { day: 15, miles: 4, title: 'Candy cane climbs', kind: 'hills', how: '1 mi easy warm-up · 8 × 45 sec strong uphill, walk or jog back down · easy jog to finish' },
    { day: 16, miles: 6, title: 'Tinsel trot', kind: 'easy' },
    { day: 17, miles: 5, title: 'Sleigh bell 400s', kind: 'intervals', how: '1.5 mi easy warm-up · 8 × 400 m (about 2 min) quick with 90 sec easy jog between · 1.5 mi easy cool-down' },
    { day: 18, miles: 2, title: 'Wrap-it-up jog', kind: 'easy' },
    { day: 19, miles: 10, title: 'The big one: double digits!', kind: 'long', how: 'Easy, steady pace. Bring water and a snack!' },
    { day: 20, miles: 3, title: 'Longest night shakeout', kind: 'easy' },
    { day: 21, miles: 2, title: 'Solstice shakeout', kind: 'easy' },
    { day: 22, miles: 3, title: 'Last-minute hill rush', kind: 'hills', how: '1 mi easy warm-up · 6 × 60 sec strong uphill, walk or jog back down · easy jog to finish' },
    { day: 23, miles: 3, title: 'Christmas Eve Eve', kind: 'easy' },
    { day: 24, miles: 5, title: 'Sleigh tempo finale', kind: 'tempo', how: '1 mi easy warm-up · 3 mi steady, comfortably hard · 1 mi easy cool-down' },
  ],
}

export const WORKOUT_LABEL: Record<Workout, string> = {
  easy: 'Easy run or walk',
  long: 'Saturday long one 🌲',
  hills: 'Hill repeats ⛰️',
  intervals: 'Intervals ⚡',
  tempo: 'Tempo 🎯',
}

/**
 * Size of each door tile in the mosaic grid (4 columns).
 * 'w' = 2 wide, 'b' = 2×2 big, 's' = small. Order = order on screen.
 */
export const LAYOUT: [day: number, size: 's' | 'w' | 'b'][] = [
  [7, 'w'], [12, 's'], [1, 's'],
  [19, 's'], [3, 's'], [15, 'w'],
  [10, 'w'], [21, 's'], [5, 's'],
  [24, 'b'], [2, 's'], [17, 's'], [8, 's'], [14, 's'],
  [11, 's'], [6, 's'], [20, 'b'], [22, 's'], [16, 's'],
  [4, 'w'], [23, 's'], [9, 's'],
  [13, 'w'], [18, 'w'],
]

// ── AT Protocol record types (stored in each runner's own Bluesky repo) ──
const NS = 'io.github.911idonotcode.runadvent'
export const COLLECTION_DAY = `${NS}.day`
export const COLLECTION_PROFILE = `${NS}.profile`
export const COLLECTION_TEAM = `${NS}.team`
export const COLLECTION_ROSTER = `${NS}.roster`

export const MI_TO_KM = 1.609344

/**
 * Strava import: the address of your Cloudflare worker (see STRAVA_SETUP.md),
 * e.g. 'https://runadvent-strava.yourname.workers.dev'. Leave '' to hide Strava.
 */
export const STRAVA_WORKER_URL = ''
