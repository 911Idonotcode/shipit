import './style.css'
import { HASHTAG, HOST_HANDLE, LAYOUT, YEAR } from './config'
import { initSession, signIn, signOut, type Session } from './auth'
import { deleteAll, deleteDay, getProfile, listDays, saveDay, saveProfile, type DayRecord, type Profile, type Units } from './data'
import {
  currentDay, doorOpensAt, doorState, fmtDist, fmtDuration, fmtPace, metersFrom, milesToUnits, now,
  parseDuration, stats, target, toUnits,
} from './calendar'
import { activitiesOn, connectStrava, disconnectStrava, handleStravaReturn, stravaAthlete, stravaConnected, stravaEnabled, type Activity } from './strava'
import { attachHandleTypeahead } from './typeahead'
import { loadMembers, type Member } from './members'
import { defaultPostText, drawCard, graphemeLength, loadPhoto, postToBluesky, postUrl, shareImage, toJpeg, type CardInput } from './share'

const app = document.querySelector<HTMLDivElement>('#app')!
const TERMS_KEY = 'runadvent:accepted-terms'

let session: Session | null = null
let profile: Profile | null = null
let days = new Map<number, DayRecord>()
let myHandle = ''

// ── helpers ──
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!
const units = (): Units => profile?.units ?? 'mi'
const monthDay = (d: number) => `Dec ${d}`
const isWeekend = (d: number) => [0, 6].includes(new Date(YEAR, 11, d).getDay())
const kind = (d: number) => (isWeekend(d) ? ' · Weekend long one 🌲' : '')

function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  el.textContent = msg
  document.body.append(el)
  setTimeout(() => el.classList.add('out'), 3200)
  setTimeout(() => el.remove(), 3700)
}

async function busy<T>(btn: HTMLButtonElement, label: string, fn: () => Promise<T>): Promise<T | undefined> {
  const prev = btn.innerHTML
  btn.disabled = true
  btn.innerHTML = `<span class="spinner"></span> ${esc(label)}`
  try {
    return await fn()
  } catch (e) {
    console.error(e)
    toast((e as Error).message || 'Something went wrong', 'err')
  } finally {
    btn.disabled = false
    btn.innerHTML = prev
  }
}

// ── ambience: snow + lights ──
function ambience() {
  const snow = document.createElement('div')
  snow.className = 'snow'
  snow.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < 46; i++) {
    const f = document.createElement('i')
    const size = 3 + Math.random() * 6
    f.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${9 + Math.random() * 12}s;animation-delay:-${Math.random() * 20}s;opacity:${0.25 + Math.random() * 0.55};--drift:${Math.random() * 40 - 20}px`
    snow.append(f)
  }
  document.body.prepend(snow)
}

function lights() {
  const colors = ['gold', 'red', 'blue', 'green']
  return `<div class="lights" aria-hidden="true">${Array.from({ length: 11 }, (_, i) => `<span class="bulb ${colors[i % 4]}" style="animation-delay:${(i * 0.37) % 2}s"></span>`).join('')}</div>`
}

// ── sheets (bottom drawers) ──
function openSheet(html: string, onMount?: (el: HTMLElement) => void) {
  closeSheet()
  const wrap = document.createElement('div')
  wrap.className = 'sheet-wrap'
  wrap.innerHTML = `<div class="backdrop" data-close></div><section class="sheet" role="dialog" aria-modal="true"><div class="grabber" data-close></div><button class="x" data-close aria-label="Close">✕</button>${html}</section>`
  document.body.append(wrap)
  document.body.classList.add('locked')
  requestAnimationFrame(() => wrap.classList.add('in'))
  wrap.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).hasAttribute('data-close')) closeSheet()
  })
  onMount?.($('.sheet', wrap))
}

function closeSheet() {
  document.querySelectorAll('.sheet-wrap').forEach((w) => {
    w.classList.remove('in')
    setTimeout(() => w.remove(), 250)
  })
  document.body.classList.remove('locked')
}
addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet())

// ── landing (signed out) ──
function renderLanding(error = '') {
  app.innerHTML = `
    ${lights()}
    <main class="wrap landing">
      <h1 class="host">@${esc(HOST_HANDLE).replace(/\./, '<wbr>.')}</h1>
      <h2 class="title">🎄 Running Advent Calendar</h2>
      <p class="lede">24 days. 24 runs (or walks).<br/>1–5 miles on weekdays. Weekends go long.</p>
      <form class="card join" novalidate>
        <h3>A few things to know:</h3>
        <ul class="facts">
          <li><span>🎄</span>December 1–24, a new door every midnight</li>
          <li><span>🏃</span>Weekdays: 1–5 miles, a different distance each day</li>
          <li><span>🌲</span>Saturdays &amp; Sundays are saved for long runs or walks</li>
          <li><span>✍️</span>Log the miles you actually did. Shorter or longer still counts.</li>
          <li><span>⏱️</span>No pace requirements. Run, jog, walk.</li>
          <li><span>🦋</span>Sign in with Bluesky. Your runs live in your account.</li>
          <li><span>📸</span>Share each door to Bluesky or Instagram</li>
          ${stravaEnabled() ? '<li><span>🧡</span>Optional: connect Strava to import your runs</li>' : ''}
          <li><span>👋</span>A friendly Member board, with no rankings</li>
          <li><span>❤️</span>All welcome!</li>
        </ul>
        <label class="field">
          <span>Your Bluesky handle</span>
          <input name="handle" autocapitalize="none" spellcheck="false" placeholder="Start typing your name or handle" required />
        </label>
        <label class="check">
          <input type="checkbox" name="terms" ${localStorage.getItem(TERMS_KEY) ? 'checked' : ''} />
          <span>I'm 18+ (or have a parent's OK) and taking this on at my own risk. I've read the <a href="#" data-info>health disclaimer &amp; privacy note</a>.</span>
        </label>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        <button class="btn btn-red" type="submit">Join with Bluesky 🦋</button>
        <p class="small center">Already joined? Same button. Just sign in again.</p>
        <div class="new-bsky">
          <p>New to Bluesky? Make a free account, then come back here and join.</p>
          <a class="btn btn-ghost" href="https://bsky.app/" target="_blank" rel="noopener">Sign up for Bluesky 🦋</a>
        </div>
        <p class="tagline">No medals, no pressure. Just a little daily nudge to keep moving through the holidays.</p>
      </form>
      ${footer()}
    </main>`

  const form = $<HTMLFormElement>('form.join')
  attachHandleTypeahead(
    form.elements.namedItem('handle') as HTMLInputElement,
    import.meta.env.DEV && new URLSearchParams(location.search).has('demo-search')
      ? async (q) => [
          { did: 'did:plc:1', handle: 'acastanedalife.bsky.social', displayName: 'Andres Castañeda' },
          { did: 'did:plc:2', handle: 'andrea-runs.bsky.social', displayName: 'Andrea 🏃‍♀️' },
          { did: 'did:plc:3', handle: 'andy.bsky.social' },
        ].filter((a) => (a.handle + (a.displayName ?? '')).toLowerCase().includes(q.toLowerCase().slice(0, 2)))
      : undefined,
  )
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const handle = (form.elements.namedItem('handle') as HTMLInputElement).value.trim()
    const terms = (form.elements.namedItem('terms') as HTMLInputElement).checked
    if (!handle) return renderLanding('Enter your Bluesky handle to join.')
    if (!terms) return renderLanding('Please tick the box to confirm you’re taking part at your own risk.')
    localStorage.setItem(TERMS_KEY, '1')
    await busy($<HTMLButtonElement>('button[type=submit]', form), 'Opening Bluesky…', async () => {
      try {
        await signIn(handle) // redirects away
      } catch (err) {
        console.error(err)
        renderLanding(`Couldn't find “${handle}”. Check the spelling. It usually looks like name.bsky.social.`)
      }
    })
  })
  bindCommon()
}

function footer() {
  return `<footer class="foot">
    <a href="https://bsky.app/profile/${esc(HOST_HANDLE)}" target="_blank" rel="noopener">@${esc(HOST_HANDLE)}</a>
    · Run safe, listen to your body, rest when you need to. ·
    <a href="#" data-info>Health &amp; privacy</a>
  </footer>`
}

function bindCommon() {
  document.querySelectorAll('[data-info]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault()
      openInfo()
    }),
  )
}

function openInfo() {
  openSheet(`
    <h2>Health &amp; privacy</h2>
    <div class="prose">
      <h4>Health disclaimer</h4>
      <p>This is a just-for-fun challenge, not medical or coaching advice. Check with a doctor before starting any new exercise, go at your own pace, walk whenever you like, and skip a day if something hurts. You take part at your own risk.</p>
      <h4>Where your data lives</h4>
      <p>There's no separate database. When you open a door, the calendar saves a small record (day, distance, optional time and note) <strong>in your own Bluesky account</strong>, the same place your posts live. Like posts, these records are public on the AT Protocol network.</p>
      <p><strong>Member board:</strong> everyone taking part can see your name, Bluesky handle, days completed, streak and total distance. You can hide yourself anytime in Settings.</p>
      <p>Photos stay on your device. One only leaves it if you choose <em>Post to Bluesky</em> or share it yourself.</p>
      ${stravaEnabled() ? `<h4>Strava (optional)</h4>
      <p>If you connect Strava, the calendar only <em>reads</em> your runs and walks for the door you're opening, and only when you tap <em>Import from Strava</em>. Your Strava login stays on this device. You can disconnect anytime in Settings.</p>` : ''}
      <p><em>Delete my data</em> in Settings removes every calendar record from your account. Posts you've shared stay until you delete them in Bluesky.</p>
    </div>`)
}

// ── main app (signed in) ──
let tick: number | undefined
let renderedDay = -1

function renderApp() {
  const today = currentDay()
  renderedDay = today
  const s = stats(days, today)
  const u = units()
  const name = profile?.name || 'friend'
  const greeting = today === 0 ? `You're in, ${name}` : today > 24 ? `You did it, ${name}` : `Merry miles, ${name}`

  app.innerHTML = `
    ${lights()}
    <main class="wrap">
      <header class="top">
        <a class="handle" href="https://bsky.app/profile/${esc(HOST_HANDLE)}" target="_blank" rel="noopener">@${esc(HOST_HANDLE)}</a>
        <button class="gear" aria-label="Settings">⚙️</button>
      </header>
      <h1 class="hello">${esc(greeting)} 🎄</h1>
      ${hero(today)}
      ${today > 0 ? `
      <section class="stats" aria-label="Your stats">
        <div><b>${s.doors}<small>/24</small></b><span>Doors opened</span></div>
        <div><b>${s.streak}${s.streak >= 3 ? '🔥' : ''}</b><span>Day streak</span></div>
        <div><b>${fmtDist(toUnits(s.meters, u), u, false)}<small>${u}</small></b><span>Total ${u === 'mi' ? 'miles' : 'km'}</span></div>
      </section>` : ''}
      <button class="btn btn-green invite"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg> Invite a friend</button>
      <h2 class="section">${today === 0 ? 'Preview' : 'Your doors'}</h2>
      <div class="grid">${LAYOUT.map(([d, size]) => door(d, size, today)).join('')}</div>
      <section class="board" aria-labelledby="board-h">
        <h2 class="section" id="board-h">Member board</h2>
        <p class="board-sub">Everyone who's joined. No rankings, just cheering each other on. 💛</p>
        <div class="board-list"><div class="board-loading"><span class="spinner"></span> Gathering the crew…</div></div>
      </section>
      ${footer()}
    </main>`

  $('.gear').addEventListener('click', openSettings)
  $('.invite').addEventListener('click', invite)
  document.querySelectorAll<HTMLElement>('.door').forEach((el) =>
    el.addEventListener('click', () => openDoor(Number(el.dataset.day))),
  )
  document.querySelector('[data-open-today]')?.addEventListener('click', () => openDoor(today))
  document.querySelector('[data-share-today]')?.addEventListener('click', () => openShare(today))
  bindCommon()
  renderBoard()

  clearInterval(tick)
  tick = window.setInterval(() => {
    if (currentDay() !== renderedDay) return renderApp()
    updateCountdown()
  }, 1000)
  updateCountdown()
}

function hero(today: number) {
  const u = units()
  if (today === 0) {
    return `<section class="card hero stripe">
      <p class="center">The first door opens in</p>
      ${countdownBoxes(true)}
      <p class="center small">December 1 at midnight, your time.</p>
    </section>`
  }
  if (today > 24) {
    const s = stats(days, today)
    return `<section class="card hero stripe center">
      <p class="big-emoji">🎁</p>
      <h3>That's a wrap!</h3>
      <p>You opened <b>${s.doors}</b> of 24 doors and covered <b>${fmtDist(toUnits(s.meters, u), u)}</b>. See you next December!</p>
    </section>`
  }
  const t = target(today)
  const rec = days.get(today)
  if (rec) {
    return `<section class="card hero stripe">
      <p class="eyebrow">Day ${today} · done ✅</p>
      <h3>${esc(t.title)}</h3>
      <p class="target">${fmtDist(toUnits(rec.distanceMeters, u), u)}</p>
      <button class="btn btn-blue" data-share-today>Share today's run</button>
      <p class="center small">Next door opens in</p>
      ${countdownBoxes(false)}
    </section>`
  }
  return `<section class="card hero stripe">
    <p class="eyebrow">Today's door · ${monthDay(today)}${kind(today)}</p>
    <h3>${esc(t.title)}</h3>
    <p class="target">${fmtDist(milesToUnits(t.miles, u), u)}</p>
    <button class="btn btn-red" data-open-today>Open door ${today} 🎁</button>
  </section>`
}

function countdownBoxes(withDays: boolean) {
  const cells = withDays ? ['days', 'hours', 'mins', 'secs'] : ['hours', 'mins', 'secs']
  return `<div class="countdown ${withDays ? '' : 'mini'}">${cells.map((c) => `<div><b data-cd="${c}">–</b><span>${c}</span></div>`).join('')}</div>`
}

function updateCountdown() {
  const today = currentDay()
  const next = doorOpensAt(Math.min(today + 1, 25))
  let ms = Math.max(0, next.getTime() - now().getTime())
  const parts: Record<string, number> = {}
  parts.days = Math.floor(ms / 864e5)
  ms -= parts.days * 864e5
  parts.hours = Math.floor(ms / 36e5)
  ms -= parts.hours * 36e5
  parts.mins = Math.floor(ms / 6e4)
  parts.secs = Math.floor((ms - parts.mins * 6e4) / 1000)
  document.querySelectorAll<HTMLElement>('[data-cd]').forEach((el) => {
    const k = el.dataset.cd!
    const showDaysInHours = !document.querySelector('[data-cd=days]') && k === 'hours'
    el.textContent = String(showDaysInHours ? parts.hours + parts.days * 24 : parts[k])
  })
}

function door(day: number, size: string, today: number) {
  const state = doorState(day, days, today)
  const rec = days.get(day)
  const u = units()
  const label =
    state === 'done' ? `Day ${day}, done: ${fmtDist(toUnits(rec!.distanceMeters, u), u)}` :
    state === 'locked' ? `Day ${day}, opens ${monthDay(day)}` :
    state === 'today' ? `Day ${day}, today's door` : `Day ${day}, open to catch up`
  return `<button class="door ${size} ${state} theme-${day % 5}" data-day="${day}" aria-label="${label}">
    <span class="rib-h"></span><span class="rib-v"></span><span class="bow"></span>
    <span class="num">${day}</span>
    <span class="flake" aria-hidden="true">❄</span>
    ${state === 'done' ? `<span class="done-badge">✓ ${fmtDist(toUnits(rec!.distanceMeters, u), u)}</span>` : ''}
    ${state === 'open' ? `<span class="catchup">catch up</span>` : ''}
  </button>`
}

async function invite() {
  const url = location.origin + import.meta.env.BASE_URL
  const text = `I'm doing the @${HOST_HANDLE} Running Advent Calendar: 24 days, 24 runs (or walks): 1–5 miles on weekdays, long ones on weekends. Join me! 🎄 #${HASHTAG}`
  if (navigator.share) {
    try {
      return await navigator.share({ title: 'Running Advent Calendar', text, url })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  open(`https://bsky.app/intent/compose?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank')
}

// ── member board ──
let members: Member[] | null = null
let membersAt = 0
let membersLoading = false
let membersError = false

function selfMember(): Member | null {
  if (profile?.showOnBoard === false || !session) return null
  const s = stats(days)
  const prev = members?.find((m) => m.isYou)
  return { did: session.did, handle: myHandle || prev?.handle || '', name: profile?.name || 'You', avatar: prev?.avatar, doors: s.doors, streak: s.streak, meters: s.meters, isYou: true }
}

async function renderBoard() {
  const box = document.querySelector<HTMLElement>('.board-list')
  if (!box) return
  if (members) box.innerHTML = boardHtml()
  if (membersLoading || (members && Date.now() - membersAt < 120_000)) return
  membersLoading = true
  try {
    members =
      import.meta.env.DEV && new URLSearchParams(location.search).has('demo')
        ? (await import('./demo')).demoMembers(session!.did)
        : await loadMembers({ did: session!.did, profile: profile!, days })
    membersError = false
  } catch (e) {
    console.error('member board', e)
    membersError = true
    members ??= []
  } finally {
    membersAt = Date.now()
    membersLoading = false
  }
  const fresh = document.querySelector<HTMLElement>('.board-list')
  if (fresh) fresh.innerHTML = boardHtml()
}

function boardHtml() {
  const u = units()
  const me = selfMember()
  const list = [...(me ? [me] : []), ...(members ?? []).filter((m) => !m.isYou)]
  const count = list.length
  const rows = list
    .map((m) => {
      const onStreak = m.streak >= 2
      const initial = esc((m.name.trim()[0] || '?').toUpperCase())
      return `<li class="member${m.isYou ? ' you' : ''}">
        ${m.avatar ? `<img class="av" src="${esc(m.avatar)}" alt="" loading="lazy" />` : `<span class="av">${initial}</span>`}
        <span class="who">
          <b>${esc(m.name)}${m.isYou ? ' <em>(you)</em>' : ''}</b>
          ${m.handle ? `<a href="https://bsky.app/profile/${esc(m.handle)}" target="_blank" rel="noopener">@${esc(m.handle)}</a>` : ''}
        </span>
        <span class="c streak" title="${onStreak ? `${m.streak}-day streak` : 'Not on a streak right now'}">${onStreak ? '<i class="tick" aria-label="On a streak">✓</i>' : '<span class="sr">No streak</span>'}</span>
        <span class="c"><b>${m.doors}</b></span>
        <span class="c"><b>${fmtDist(Math.round(toUnits(m.meters, u) * 10) / 10, u, false)}</b></span>
      </li>`
    })
    .join('')
  return `
    <div class="board-head"><span>${count} ${count === 1 ? 'runner' : 'runners'}</span><span class="c">Streak</span><span class="c">Days</span><span class="c">${u === 'mi' ? 'Miles' : 'Km'}</span></div>
    <ul>${rows || '<li class="member empty">Be the first to join!</li>'}</ul>
    <p class="small board-note">✓ = on a streak (2+ days in a row)${membersError ? ' · Couldn’t reach everyone right now. Showing what we could.' : ''}</p>
    ${profile?.showOnBoard === false ? '<p class="small board-note">You’re hidden from the board. Change it in Settings ⚙️</p>' : ''}`
}

// ── door sheet ──
function openDoor(day: number) {
  const today = currentDay()
  const state = doorState(day, days, today)
  const t = target(day)
  const u = units()

  if (state === 'locked') {
    return openSheet(`
      <p class="eyebrow">Day ${day} · ${monthDay(day)}</p>
      <h2>No peeking! 🤫</h2>
      <p>This door opens at midnight on ${monthDay(day)}.</p>`)
  }

  const rec = days.get(day)
  if (rec && state === 'done') {
    const pace = rec.durationSeconds ? fmtPace(rec.distanceMeters, rec.durationSeconds, u) : ''
    return openSheet(`
      <p class="eyebrow">Day ${day} · ${monthDay(day)} · done ✅</p>
      <h2>${esc(t.title)}</h2>
      <div class="stats in-sheet">
        <div><b>${fmtDist(toUnits(rec.distanceMeters, u), u, false)}<small>${u}</small></b><span>Distance</span></div>
        <div><b>${rec.durationSeconds ? fmtDuration(rec.durationSeconds) : '–'}</b><span>Time</span></div>
        <div><b>${pace ? pace.split(' ')[0] : '–'}</b><span>Pace${pace ? ' /' + u : ''}</span></div>
      </div>
      ${rec.note ? `<p class="note">“${esc(rec.note)}”</p>` : ''}
      ${rec.postUri ? `<p class="small"><a href="${postUrl(rec.postUri)}" target="_blank" rel="noopener">View your Bluesky post →</a></p>` : ''}
      <button class="btn btn-blue" data-share>Share this door 📸</button>
      <button class="btn btn-ghost" data-edit>Edit</button>
      <button class="link danger" data-reset>Close this door again</button>`,
      (el) => {
        $('[data-share]', el).addEventListener('click', () => openShare(day))
        $('[data-edit]', el).addEventListener('click', () => openLog(day))
        $<HTMLButtonElement>('[data-reset]', el).addEventListener('click', async (e) => {
          if (!confirm(`Reset day ${day}? This removes the run from your calendar.`)) return
          await busy(e.currentTarget as HTMLButtonElement, 'Resetting…', async () => {
            await deleteDay(session!.agent, session!.did, day)
            days.delete(day)
            closeSheet()
            renderApp()
          })
        })
      })
  }
  openLog(day)
}

function openLog(day: number) {
  const t = target(day)
  const u = units()
  const rec = days.get(day)
  const dist = rec ? toUnits(rec.distanceMeters, u) : milesToUnits(t.miles, u)
  openSheet(`
    <p class="eyebrow">Day ${day} · ${monthDay(day)}${kind(day)}${day < currentDay() ? ' · catching up' : ''}</p>
    <h2>${esc(t.title)}</h2>
    <p class="target-chip">Suggested: <b>${fmtDist(milesToUnits(t.miles, u), u)}</b>${isWeekend(day) ? ' · run or walk' : ''}</p>
    <p class="small">We've filled in the suggestion. Did more or less? Just change it. It's all good. 💛</p>
    ${stravaEnabled() ? (stravaConnected()
      ? `<button class="btn btn-strava" type="button" data-import>Import from Strava</button><div class="strava-list" hidden></div>`
      : `<button class="link strava-link" type="button" data-connect>Connect Strava to import your runs</button>`) : ''}
    <form class="log" novalidate>
      <div class="row">
        <label class="field"><span>Your ${u === 'mi' ? 'miles' : 'km'}</span>
          <input name="dist" inputmode="decimal" value="${fmtDist(dist, u, false)}" required /></label>
        <label class="field"><span>Time <em>(optional)</em></span>
          <input name="time" inputmode="numeric" placeholder="mm:ss" value="${rec?.durationSeconds ? fmtDuration(rec.durationSeconds) : ''}" /></label>
      </div>
      <label class="field"><span>Note <em>(optional)</em></span>
        <input name="note" maxlength="140" placeholder="Snack of the day? 🥐" value="${esc(rec?.note ?? '')}" /></label>
      <p class="error" hidden></p>
      <button class="btn btn-green" type="submit">${rec ? 'Save changes' : `Open door ${day} 🎁`}</button>
    </form>`,
    (el) => {
      const form = $<HTMLFormElement>('form', el)
      let stravaId = rec?.stravaActivityId
      el.querySelector('[data-connect]')?.addEventListener('click', connectStrava)
      el.querySelector<HTMLButtonElement>('[data-import]')?.addEventListener('click', (e) =>
        busy(e.currentTarget as HTMLButtonElement, 'Checking Strava…', async () => {
          const list = $('.strava-list', el)
          const acts = await activitiesOn(day)
          list.hidden = false
          if (!acts.length) {
            list.innerHTML = `<p class="small">No runs or walks on Strava for ${monthDay(day)} yet. You can still type the distance below.</p>`
            return
          }
          const fill = (a: { distance: number; moving_time: number; name: string; id?: number }) => {
            ;(form.elements.namedItem('dist') as HTMLInputElement).value = fmtDist(toUnits(a.distance, u), u, false)
            ;(form.elements.namedItem('time') as HTMLInputElement).value = fmtDuration(a.moving_time)
            const note = form.elements.namedItem('note') as HTMLInputElement
            if (!note.value) note.value = a.name.slice(0, 140)
            stravaId = a.id
            list.innerHTML = `<p class="small">✓ Filled in from Strava. Check it and tap the button below.</p>`
          }
          list.innerHTML =
            acts.map((a, i) => `<button type="button" class="strava-act" data-i="${i}">
              <b>${esc(a.name)}</b>
              <span>${esc(a.type)} · ${fmtDist(toUnits(a.distance, u), u)} · ${fmtDuration(a.moving_time)}</span>
            </button>`).join('') +
            (acts.length > 1 ? `<button type="button" class="link" data-all>Add them all together</button>` : '') +
            `<p class="powered">Activity data from Strava</p>`
          list.querySelectorAll<HTMLElement>('.strava-act').forEach((b) =>
            b.addEventListener('click', () => fill(acts[Number(b.dataset.i)])),
          )
          list.querySelector('[data-all]')?.addEventListener('click', () =>
            fill({
              distance: acts.reduce((n: number, a: Activity) => n + a.distance, 0),
              moving_time: acts.reduce((n: number, a: Activity) => n + a.moving_time, 0),
              name: acts.map((a) => a.name).join(' + '),
            }),
          )
        }),
      )
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const fd = new FormData(form)
        const distVal = parseFloat(String(fd.get('dist')).replace(',', '.'))
        const dur = parseDuration(String(fd.get('time') ?? ''))
        const err = $('.error', form)
        if (!(distVal > 0 && distVal < 200)) return showErr(err, 'Enter how far you went.')
        if (Number.isNaN(dur)) return showErr(err, 'Time looks off. Try 32:15 or 1:02:30.')
        const next: DayRecord = {
          year: YEAR,
          day,
          distanceMeters: Math.round(metersFrom(distVal, u)),
          ...(dur ? { durationSeconds: dur } : {}),
          ...(String(fd.get('note') ?? '').trim() ? { note: String(fd.get('note')).trim() } : {}),
          ...(rec?.postUri ? { postUri: rec.postUri } : {}),
          ...(stravaId ? { stravaActivityId: stravaId } : {}),
          completedAt: rec?.completedAt ?? new Date().toISOString(),
        }
        await busy($<HTMLButtonElement>('button[type=submit]', form), 'Saving…', async () => {
          await saveDay(session!.agent, session!.did, next)
          days.set(day, next)
          renderApp()
          if (!rec) celebrate()
          openShare(day, !rec)
        })
      })
    })
}

function showErr(el: HTMLElement, msg: string) {
  el.textContent = msg
  el.hidden = false
}

function celebrate() {
  const box = document.createElement('div')
  box.className = 'confetti'
  box.setAttribute('aria-hidden', 'true')
  const colors = ['#f4c34d', '#e5394a', '#18a66f', '#3fb7e8', '#f6efe3']
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i')
    p.style.cssText = `left:${50 + (Math.random() - 0.5) * 30}%;background:${colors[i % 5]};--x:${(Math.random() - 0.5) * 120}vw;--y:${-40 - Math.random() * 50}vh;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.15}s`
    box.append(p)
  }
  document.body.append(box)
  setTimeout(() => box.remove(), 2200)
}

// ── share sheet ──
function openShare(day: number, justOpened = false) {
  const rec = days.get(day)
  if (!rec) return
  const s = stats(days)
  const input: CardInput = { rec, units: units(), streak: s.streak, doors: s.doors, photo: null }

  openSheet(`
    ${justOpened ? `<p class="eyebrow">Door ${day} is open 🎉</p><h2>Nice work! Share it?</h2>` : `<p class="eyebrow">Day ${day}</p><h2>Share your run</h2>`}
    <div class="preview"><canvas aria-label="Share image preview"></canvas></div>
    <label class="btn btn-ghost photo-btn">
      <input type="file" accept="image/*" hidden />
      <span>📷 Add your run photo</span>
    </label>
    <label class="field"><span>Bluesky post</span>
      <textarea rows="6" name="text"></textarea>
      <small class="count"></small>
    </label>
    <button class="btn btn-blue" data-bsky>Post to Bluesky 🦋</button>
    <button class="btn btn-insta" data-insta>Share to Instagram</button>
    <p class="small center">Instagram opens from your phone's share sheet. The caption is copied, so just paste it. On a computer the image downloads instead.</p>
    <p class="posted small center" hidden></p>`,
    async (el) => {
      const canvas = $<HTMLCanvasElement>('canvas', el)
      const ta = $<HTMLTextAreaElement>('textarea', el)
      const count = $('.count', el)
      const fileInput = $<HTMLInputElement>('input[type=file]', el)
      ta.value = defaultPostText(input)
      const updateCount = () => {
        const n = graphemeLength(ta.value)
        count.textContent = `${n}/300`
        count.classList.toggle('over', n > 300)
      }
      ta.addEventListener('input', updateCount)
      updateCount()
      await drawCard(canvas, input)

      fileInput.addEventListener('change', async () => {
        const f = fileInput.files?.[0]
        if (!f) return
        try {
          input.photo = await loadPhoto(f)
          await drawCard(canvas, input)
          $('.photo-btn span', el).textContent = '📷 Change photo'
        } catch {
          toast("That photo couldn't be opened. Try a JPG or PNG.", 'err')
        }
      })

      const alt = () => {
        const u = input.units
        const parts = [`Day ${day} of 24`, fmtDist(toUnits(rec.distanceMeters, u), u)]
        if (rec.durationSeconds) parts.push(`time ${fmtDuration(rec.durationSeconds)}`, `pace ${fmtPace(rec.distanceMeters, rec.durationSeconds, u)}`)
        return `${input.photo ? 'Run photo with' : 'Running Advent Calendar card with'} stats: ${parts.join(', ')}.`
      }

      $<HTMLButtonElement>('[data-bsky]', el).addEventListener('click', (e) => {
        if (graphemeLength(ta.value) > 300) return toast('Bluesky posts max out at 300 characters.', 'err')
        busy(e.currentTarget as HTMLButtonElement, 'Posting…', async () => {
          const img = await toJpeg(canvas)
          const uri = await postToBluesky(session!.agent, ta.value, img, alt())
          const updated = { ...rec, postUri: uri }
          days.set(day, updated)
          await saveDay(session!.agent, session!.did, updated).catch(() => {})
          const p = $('.posted', el)
          p.hidden = false
          p.innerHTML = `Posted! 🎉 <a href="${postUrl(uri)}" target="_blank" rel="noopener">View on Bluesky →</a>`
          toast('Posted to Bluesky 🦋')
        })
      })

      $<HTMLButtonElement>('[data-insta]', el).addEventListener('click', (e) =>
        busy(e.currentTarget as HTMLButtonElement, 'Preparing…', async () => {
          const img = await toJpeg(canvas, 8_000_000)
          const caption = ta.value
          const r = await shareImage(img, day, caption)
          if (r === 'downloaded') toast('Image saved. Caption copied to your clipboard.')
          if (r === 'shared') toast('Caption copied. Paste it in Instagram.')
        }),
      )
    })
}

// ── settings ──
function openSettings() {
  const u = units()
  openSheet(`
    <h2>Settings</h2>
    <form class="settings" novalidate>
      <label class="field"><span>Name</span><input name="name" maxlength="40" value="${esc(profile?.name ?? '')}" /></label>
      <div class="field inline"><span>Distance in</span>
        <div class="seg" role="radiogroup">
          <label><input type="radio" name="units" value="mi" ${u === 'mi' ? 'checked' : ''}/><span>Miles</span></label>
          <label><input type="radio" name="units" value="km" ${u === 'km' ? 'checked' : ''}/><span>Km</span></label>
        </div>
      </div>
      <label class="check board-toggle">
        <input type="checkbox" name="board" ${profile?.showOnBoard === false ? '' : 'checked'} />
        <span>Show me on the Member board<br/><small>Others see your name, days completed, streak and distance.</small></span>
      </label>
      <button class="btn btn-green" type="submit">Save</button>
      ${stravaEnabled() ? `<div class="strava-box">
        <span>Strava</span>
        ${stravaConnected()
          ? `<p class="small">Connected${stravaAthlete() ? ' as ' + esc(stravaAthlete()!) : ''} on this device.</p>
             <button class="btn btn-ghost" type="button" data-strava-off>Disconnect Strava</button>`
          : `<p class="small">Import your runs and walks instead of typing them.</p>
             <button class="btn btn-strava" type="button" data-strava-on>Connect with Strava</button>`}
      </div>` : ''}
      <button class="btn btn-ghost" type="button" data-signout>Sign out</button>
      <button class="btn btn-ghost danger" type="button" data-delete>Delete my data</button>
      <p class="small center">Signed in as ${esc(myHandle ? '@' + myHandle : session!.did)}</p>
    </form>`,
    (el) => {
      const form = $<HTMLFormElement>('form', el)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const fd = new FormData(form)
        const next: Profile = {
          ...profile!,
          name: String(fd.get('name') ?? '').trim() || profile!.name,
          units: (fd.get('units') as Units) ?? 'mi',
          showOnBoard: fd.get('board') === 'on',
        }
        busy($<HTMLButtonElement>('button[type=submit]', form), 'Saving…', async () => {
          await saveProfile(session!.agent, session!.did, next)
          profile = next
          closeSheet()
          renderApp()
          toast('Saved ✨')
        })
      })
      el.querySelector('[data-strava-on]')?.addEventListener('click', connectStrava)
      el.querySelector<HTMLButtonElement>('[data-strava-off]')?.addEventListener('click', (e) =>
        busy(e.currentTarget as HTMLButtonElement, 'Disconnecting…', async () => {
          await disconnectStrava()
          openSettings()
          toast('Strava disconnected')
        }),
      )
      $('[data-signout]', el).addEventListener('click', async () => {
        await signOut(session!)
        location.reload()
      })
      $<HTMLButtonElement>('[data-delete]', el).addEventListener('click', (e) => {
        if (!confirm('Delete all your Running Advent Calendar data from your Bluesky account? Posts you shared stay until you delete them in Bluesky. This can’t be undone.')) return
        busy(e.currentTarget as HTMLButtonElement, 'Deleting…', async () => {
          await deleteAll(session!.agent, session!.did)
          if (stravaConnected()) await disconnectStrava()
          localStorage.removeItem(TERMS_KEY)
          await signOut(session!)
          alert('Your calendar data was deleted.')
          location.reload()
        })
      })
    })
}

// ── boot ──
async function boot() {
  ambience()
  app.innerHTML = `${lights()}<main class="wrap loading"><div class="spinner big"></div></main>`
  const stravaResult = handleStravaReturn() // must run before Bluesky sign-in reads the URL
  if (stravaResult) setTimeout(() => toast(stravaResult.msg, stravaResult.ok ? 'ok' : 'err'), 600)
  try {
    session =
      import.meta.env.DEV && new URLSearchParams(location.search).has('demo')
        ? (await import('./demo')).demoSession()
        : await initSession()
  } catch (e) {
    console.error(e)
    renderLanding('Sign-in didn’t finish. Please try again.')
    return
  }
  // Clean OAuth params from the URL but keep ?date= previews.
  if (location.hash.includes('code=') || location.hash.includes('error=')) history.replaceState(null, '', location.pathname + location.search)
  if (!session) return renderLanding()

  try {
    const [p, d] = await Promise.all([getProfile(session.agent, session.did), listDays(session.agent, session.did)])
    days = d
    profile = p
    session.agent.getProfile({ actor: session.did }).then(({ data }) => (myHandle = data.handle)).catch(() => {})
    if (!profile) {
      let name = ''
      try {
        const { data } = await session.agent.getProfile({ actor: session.did })
        name = data.displayName?.trim() || data.handle.split('.')[0]
      } catch {
        /* fine */
      }
      profile = { name, units: 'mi', acceptedTerms: !!localStorage.getItem(TERMS_KEY), createdAt: new Date().toISOString() }
      await saveProfile(session.agent, session.did, profile)
    }
    renderApp()
  } catch (e) {
    console.error(e)
    app.innerHTML = `${lights()}<main class="wrap"><section class="card center"><h3>Couldn't load your calendar</h3><p>${esc((e as Error).message)}</p><button class="btn btn-green" onclick="location.reload()">Try again</button></section></main>`
  }
}

boot()
