# 🎄 Running Advent Calendar

24 days. 24 runs or walks. 1–5 miles on weekdays. Weekends go long. Hosted by [@acastanedalife.bsky.social](https://bsky.app/profile/acastanedalife.bsky.social).

**Live site:** https://911idonotcode.github.io/shipit/

- People sign in with their **Bluesky** account. No email list and no database.
- Each opened door is saved as a small record **in the runner's own Bluesky account** (AT Protocol), so runners own their data. *Delete my data* in Settings removes it.
- After opening a door, runners add a photo. The app overlays their stats (day, distance, time, pace, streak) and lets them **post to Bluesky** in one tap or **share to Instagram** through the phone's share sheet.
- Personal stats: doors opened, day streak, total miles/km.
- **Solo or teams:** everyone gets their own calendar. Anyone can start a team (name + emoji) and share an invite link; runners can be on several teams. Team boards show teammates' days, distance and a ✓ for an active streak, with no rankings.
- **Admin overview** for the creator (`ADMIN_HANDLES` in `src/config.ts`): totals, every participant, their teams, and a CSV download. All records are public on the AT Protocol network, so this is a convenience view, not a lock.
- Optional **Strava import** (see [STRAVA_SETUP.md](STRAVA_SETUP.md)).
- Hosting is free (GitHub Pages). Nothing runs on a server.

## Editing the calendar

Everything you'd want to change is in **`src/config.ts`**: your handle, the hashtag, the year, the 24 daily distances and titles, and the tile layout.

## Going live (one-time setup)

1. In GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Merge this branch into `main`. The *Deploy to GitHub Pages* action builds and publishes the site in about a minute.
3. Open the live site and sign in with your Bluesky handle.

## Running it locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/ (use `127.0.0.1`, not `localhost`, because Bluesky's local sign-in requires it).

**Preview tricks (local only):**
- `?date=2026-12-09` pretends it's that date.
- `?demo&date=2026-12-09` uses a fake account with sample runs, so you can click around without signing in.
