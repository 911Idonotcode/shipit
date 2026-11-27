# Setting up Strava import (about 15 minutes, free)

Strava requires a secret key to connect accounts, and a secret can't live in a public website. So we run a tiny free helper on **Cloudflare** that holds it. It stores nothing.

You'll need a computer. Do the steps in this order.

---

## Step 1: Create the Cloudflare helper

1. Go to **https://dash.cloudflare.com/sign-up** and create a free account (no credit card needed).
2. In the left menu, open **Workers & Pages**. It may sit under "Compute (Workers)."
3. Click **Create** → **Start with Hello World!** (or "Create Worker").
4. Name it **`runadvent-strava`** and click **Deploy**.
5. Click **Edit code**. Delete everything in the editor, then paste in the full contents of [`strava-worker/worker.js`](strava-worker/worker.js) from this repo (open it on GitHub and use the copy icon).
6. Click **Deploy** (top right).
7. Copy the worker's address. It looks like **`https://runadvent-strava.YOUR-NAME.workers.dev`**.

## Step 2: Create your Strava API app

1. Go to **https://www.strava.com/settings/api** (log in to Strava).
2. Fill in:
   - **Application Name:** 24 Days of Run-Mas
   - **Category:** the closest fit (e.g. Other)
   - **Website:** `https://911idonotcode.github.io/shipit/`
   - **Authorization Callback Domain:** your worker's domain **without** `https://`, e.g. `runadvent-strava.YOUR-NAME.workers.dev`
3. Upload an icon (any square image) and save.
4. You'll see a **Client ID** (a number) and a **Client Secret** (click "show"). Keep this page open.

## Step 3: Give the helper its settings

1. In Cloudflare, open your `runadvent-strava` worker → **Settings** → **Variables and Secrets** → **Add**.
2. Add these three:

   | Type   | Name                   | Value |
   |--------|------------------------|-------|
   | Text   | `STRAVA_CLIENT_ID`     | the Client ID from Strava |
   | Secret | `STRAVA_CLIENT_SECRET` | the Client Secret from Strava |
   | Text   | `SITE_URL`             | `https://911idonotcode.github.io/shipit/` |

3. Click **Deploy** / **Save**.
4. Check it: open your worker address in a browser. You should see `{"ok":true,...}`.

**Never paste the Client Secret anywhere else**, including chat, GitHub or the app code.

## Step 4: Switch it on in the app

Set `STRAVA_WORKER_URL` in `src/config.ts` to your worker address, or send the address (not the secret) to Claude to do. Once that's on `main`, "Connect with Strava" appears in Settings and "Import from Strava" appears on each door.

## Step 5: Ask Strava to let other people connect

New Strava apps allow **only one athlete (you)** until Strava reviews them. Everyone else keeps logging miles by hand in the meantime.

On **https://www.strava.com/settings/api**, look for the option to request more athletes / submit the app for review, and describe it as: *"A free holiday running challenge. Runners import a day's run to mark an advent-calendar door complete. Data is shown only to the runner."* Approval can take a few weeks.
