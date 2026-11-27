// ─────────────────────────────────────────────────────────────
// Everything you'd want to tweak lives in this file.
// ─────────────────────────────────────────────────────────────

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

/**
 * The 24 doors. Distances are in miles (km is converted automatically).
 * Weekdays stay between 1 and 5 miles; Saturdays and Sundays are the long
 * runs/walks (Dec 5–6, 12–13, 19–20 in 2026). Change titles/distances freely.
 */
export const SCHEDULE: { day: number; miles: number; title: string }[] = [
  { day: 1, miles: 1, title: 'First door jitters' },
  { day: 2, miles: 2, title: 'Cocoa cruise' },
  { day: 3, miles: 1.5, title: 'Twinkle trot' },
  { day: 4, miles: 3, title: 'Sweater weather' },
  { day: 5, miles: 5, title: 'Gingerbread long haul' },
  { day: 6, miles: 4, title: 'Lazy Sunday long one' },
  { day: 7, miles: 1, title: 'Easy elf miles' },
  { day: 8, miles: 2.5, title: 'Peppermint pace' },
  { day: 9, miles: 3, title: 'Frosty fartlek' },
  { day: 10, miles: 1.5, title: 'Mitten mile-and-a-half' },
  { day: 11, miles: 4, title: 'Friday night lights' },
  { day: 12, miles: 6, title: 'Lights tour' },
  { day: 13, miles: 5, title: 'Sunday snow globe loop' },
  { day: 14, miles: 1, title: 'Recovery jingle' },
  { day: 15, miles: 3, title: 'Tinsel tempo' },
  { day: 16, miles: 2, title: 'Candy cane cadence' },
  { day: 17, miles: 3.5, title: 'Reindeer games' },
  { day: 18, miles: 1.5, title: 'Wrap-it-up walk' },
  { day: 19, miles: 7, title: 'The big one' },
  { day: 20, miles: 6, title: 'Longest night long one' },
  { day: 21, miles: 2, title: 'Solstice shakeout' },
  { day: 22, miles: 3, title: 'Last-minute shopping run' },
  { day: 23, miles: 1, title: 'Christmas Eve Eve' },
  { day: 24, miles: 5, title: 'Sleigh the finale' },
]

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

export const MI_TO_KM = 1.609344

/**
 * Strava import: the address of your Cloudflare worker (see STRAVA_SETUP.md),
 * e.g. 'https://runadvent-strava.yourname.workers.dev'. Leave '' to hide Strava.
 */
export const STRAVA_WORKER_URL = ''
