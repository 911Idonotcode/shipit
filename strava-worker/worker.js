/**
 * Running Advent Calendar: Strava helper (Cloudflare Worker)
 *
 * Strava needs a secret key to connect accounts, and a secret can't live in a
 * public website. This tiny worker holds it. It stores nothing: tokens go back
 * to the runner's own browser.
 *
 * Settings → Variables and Secrets in Cloudflare:
 *   STRAVA_CLIENT_ID      (Text)    from strava.com/settings/api
 *   STRAVA_CLIENT_SECRET  (Secret)  from strava.com/settings/api
 *   SITE_URL              (Text)    e.g. https://911idonotcode.github.io/shipit/
 *
 * Endpoints: /connect, /callback, /refresh, /activities, /disconnect
 */

const STRAVA = 'https://www.strava.com'
const DEV_ORIGIN = 'http://127.0.0.1:5173'

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET || !env.SITE_URL) {
      return new Response('Strava helper is missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET or SITE_URL (Settings → Variables and Secrets).', { status: 500 })
    }
    const site = env.SITE_URL.replace(/\/*$/, '/')
    const allowed = [new URL(site).origin, DEV_ORIGIN]
    const reqOrigin = req.headers.get('Origin')
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(reqOrigin) ? reqOrigin : allowed[0],
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
    }
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

    const isAllowedReturn = (r) => {
      try {
        return allowed.includes(new URL(r).origin)
      } catch {
        return false
      }
    }

    try {
      switch (url.pathname) {
        // 1. Browser is sent here → we forward to Strava's consent screen.
        case '/connect': {
          const back = url.searchParams.get('return') || site
          if (!isAllowedReturn(back)) return json({ error: 'bad return url' }, 400)
          const state = b64(JSON.stringify({ s: url.searchParams.get('state') || '', r: back }))
          const auth = new URL(`${STRAVA}/oauth/authorize`)
          auth.search = new URLSearchParams({
            client_id: env.STRAVA_CLIENT_ID,
            redirect_uri: `${url.origin}/callback`,
            response_type: 'code',
            approval_prompt: 'auto',
            scope: 'activity:read_all',
            state,
          })
          return Response.redirect(auth.toString(), 302)
        }

        // 2. Strava sends the runner back here → swap the code for tokens → back to the site.
        case '/callback': {
          const st = JSON.parse(unb64(url.searchParams.get('state') || '') || '{}')
          const back = isAllowedReturn(st.r) ? st.r : site
          const fail = (msg) => Response.redirect(`${back}#strava_error=${encodeURIComponent(msg)}`, 302)
          if (url.searchParams.get('error')) return fail('You cancelled the Strava connection.')
          if (!(url.searchParams.get('scope') || '').includes('activity:read')) {
            return fail('Please allow access to your activities so runs can be imported.')
          }
          const tok = await token(env, { grant_type: 'authorization_code', code: url.searchParams.get('code') })
          if (!tok.access_token) return fail(tok.message || 'Strava did not accept the connection.')
          const payload = {
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            expires_at: tok.expires_at,
            athlete: tok.athlete ? `${tok.athlete.firstname || ''} ${tok.athlete.lastname || ''}`.trim() : '',
            state: st.s,
          }
          return Response.redirect(`${back}#strava=${b64(JSON.stringify(payload))}`, 302)
        }

        // 3. Access tokens last ~6 hours; the browser renews them here.
        case '/refresh': {
          const { refresh_token } = await req.json()
          const tok = await token(env, { grant_type: 'refresh_token', refresh_token })
          if (!tok.access_token) return json({ error: 'refresh failed' }, 401)
          return json({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_at })
        }

        // 4. List activities in a time window (epoch seconds).
        case '/activities': {
          const q = new URLSearchParams({ per_page: '50' })
          for (const k of ['after', 'before']) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k))
          const r = await fetch(`${STRAVA}/api/v3/athlete/activities?${q}`, {
            headers: { Authorization: req.headers.get('Authorization') || '' },
          })
          if (!r.ok) return json({ error: `Strava said ${r.status}` }, r.status)
          const list = await r.json()
          return json(
            list.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.sport_type || a.type,
              distance: a.distance,
              moving_time: a.moving_time,
              start_date_local: a.start_date_local,
            })),
          )
        }

        // 5. Revoke access.
        case '/disconnect': {
          await fetch(`${STRAVA}/oauth/deauthorize`, {
            method: 'POST',
            headers: { Authorization: req.headers.get('Authorization') || '' },
          })
          return json({ ok: true })
        }

        default:
          return json({ ok: true, service: 'Running Advent Calendar: Strava helper' })
      }
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500)
    }
  },
}

async function token(env, params) {
  const r = await fetch(`${STRAVA}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...params }),
  })
  return r.json()
}

const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s) => {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return ''
  }
}
