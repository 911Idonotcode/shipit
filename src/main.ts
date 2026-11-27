import './style.css'
import { ADMIN_HANDLES, APP_NAME, HASHTAG, PLANS, QUOTES, WORKOUT_LABEL, type Plan, HOST_HANDLE, LAYOUT, YEAR } from './config'
import { initSession, signIn, signOut, type Session } from './auth'
import {
  createTeam, deleteAll, deleteDay, effectiveTeams, emptyRoster, getProfile, isRemoved, listDays, rosterSet, saveDay,
  saveProfile, saveRoster, teamCode, teamUri, updateTeam, type DayRecord, type Profile, type Roster, type Team, type Units,
} from './data'
import {
  currentDay, doorOpensAt, doorState, fmtDist, fmtDuration, fmtPace, metersFrom, milesToUnits, now,
  getPlan, parseDuration, setPlan, stats, target, toUnits,
} from './calendar'
import { activitiesOn, connectStrava, disconnectStrava, handleStravaReturn, stravaAthlete, stravaConnected, stravaEnabled, type Activity } from './strava'
import { attachHandleTypeahead } from './typeahead'
import { loadEveryone, loadMembers, loadRoster, loadTeam, type Member } from './members'
import { defaultPostText, drawCard, graphemeLength, loadPhoto, postToBluesky, postUrl, shareImage, toJpeg, type CardInput } from './share'

const app = document.querySelector<HTMLDivElement>('#app')!
const TERMS_KEY = 'runadvent:accepted-terms'
const INVITE_KEY = 'runadvent:pending-invite'
const TEAM_KEY = 'runadvent:selected-team'
/** Little wreath (Unicode has no wreath emoji). */
const WREATH = `<svg class="wreath" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="30" r="20" fill="none" stroke="#1f7a4a" stroke-width="11"/>
  <circle cx="32" cy="30" r="20" fill="none" stroke="#2fa266" stroke-width="5" stroke-dasharray="7 6"/>
  <g fill="#e5394a"><circle cx="16" cy="22" r="3.2"/><circle cx="46" cy="18" r="3.2"/><circle cx="49" cy="38" r="3.2"/><circle cx="20" cy="42" r="3.2"/><circle cx="33" cy="11" r="3"/></g>
  <path d="M32 50 l-11 -6 v12 z M32 50 l11 -6 v12 z" fill="#e5394a"/><circle cx="32" cy="50" r="4" fill="#c42a3a"/>
</svg>`
const isDemo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

let session: Session | null = null
let profile: Profile | null = null
let days = new Map<number, DayRecord>()
let myHandle = ''
let roster: Roster = emptyRoster()
/** Teams I'm on, after the organizer's adds/removes. */
const myTeams = () => (session ? effectiveTeams(session.did, profile, roster) : [])

// ── helpers ──
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!
const units = (): Units => profile?.units ?? 'mi'
const monthDay = (d: number) => `Dec ${d}`
const isWeekend = (d: number) => [0, 6].includes(new Date(YEAR, 11, d).getDay())
const kind = (d: number) => (target(d).kind === 'easy' ? '' : ` · ${WORKOUT_LABEL[target(d).kind]}`)
const quoteHtml = (d: number) => {
  const q = QUOTES[d]
  return q ? `<figure class="quote"><blockquote>“${esc(q.text)}”</blockquote><figcaption>— ${esc(q.who)}, <cite>${esc(q.film)}</cite></figcaption></figure>` : ''
}
const howHtml = (d: number) => (target(d).how ? `<p class="how">📝 ${esc(target(d).how!)}</p>` : '')
const planOf = (uri: string): Plan => teamInfo.get(uri)?.level ?? 'easy'
/** Suggestions follow the selected team's plan, or your own plan when solo. */
const currentPlan = (): Plan => {
  const t = currentTeam()
  return t ? planOf(t) : (profile?.plan ?? 'easy')
}

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
      <h1 class="host">${APP_NAME} ${WREATH}</h1>
      <p class="credit">made by <a href="https://bsky.app/profile/${esc(HOST_HANDLE)}" target="_blank" rel="noopener">@${esc(HOST_HANDLE)}</a></p>
      <p class="lede">24 days. 24 runs or walks.<br/>Two plans: Easy going or Intermediate.</p>
      <div class="invite-banner" hidden></div>
      <form class="card join" novalidate>
        <h3>A few things to know:</h3>
        <ul class="facts">
          <li><span>🎄</span>December 1–24, a new door every midnight</li>
          <li><span>🙂</span>Easy going: 1–5 miles on weekdays, 7 on Saturdays</li>
          <li><span>⚡</span>Intermediate: 2–6 miles on weekdays with hills &amp; intervals, up to 10 on Saturdays</li>
          <li><span>🌲</span>Saturdays are long-run days. Sundays stay short and change each week.</li>
          <li><span>✍️</span>Log the miles you do. Shorter or longer… it all counts.</li>
          <li><span>⏱️</span>No pace requirements. Run, jog, walk.</li>
          <li><span>🦋</span>Sign in with Bluesky. Your activity lives in your account.</li>
          <li><span>📸</span>Share your activity on Bluesky or Instagram</li>
          <li><span>🤝</span>Go solo, or start a team with friends</li>
          ${stravaEnabled() ? '<li><span>🧡</span>Optional: connect Strava to import your runs</li>' : ''}
          <li><span>❤️</span>All experience levels are welcome! Let's have fun!</li>
        </ul>
        <p class="tagline top">No medals, no pressure. Just a little daily nudge to keep moving through the holidays.</p>
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
  showInviteBanner()
}

async function showInviteBanner() {
  const uri = localStorage.getItem(INVITE_KEY)
  const el = document.querySelector<HTMLElement>('.invite-banner')
  if (!uri || !el) return
  const team = await getTeam(uri)
  if (!team) return
  el.innerHTML = `<b>${esc(team.emoji)} You're invited to join ${esc(team.name)}!</b><span>Sign in below and we'll add you to the team.</span>`
  el.hidden = false
}

function footer() {
  return `<footer class="foot">
    Made by <a href="https://bsky.app/profile/${esc(HOST_HANDLE)}" target="_blank" rel="noopener">@${esc(HOST_HANDLE)}</a>
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
      <p><strong>Teams:</strong> if you join or start a team, your teammates can see your name, Bluesky handle, days completed, streak and total distance. Running solo, you don't appear on anyone's board. Anyone with a team's invite link can join that team. You can leave a team, or hide yourself from team boards, anytime. The organizer can also add people to teams or remove them.</p>
      <p><strong>Organizer overview:</strong> the calendar's creator (@${esc(HOST_HANDLE)}) can see a summary of all participants: names, handles, teams, days completed and distance.</p>
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
  setPlan(currentPlan())
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
        <span class="handle">${APP_NAME} ${WREATH}</span>
        <span class="top-btns">
          ${isAdmin() ? '<button class="admin-btn">Admin</button>' : ''}
          <button class="gear" aria-label="Settings">⚙️</button>
        </span>
      </header>
      <h1 class="hello">${esc(greeting)} 🎄</h1>
      ${hero(today)}
      ${today > 0 ? `
      <section class="stats" aria-label="Your stats">
        <div><b>${s.doors}<small>/24</small></b><span>Doors opened</span></div>
        <div><b>${s.streak}${s.streak >= 3 ? '🔥' : ''}</b><span>Day streak</span></div>
        <div><b>${fmtDist(toUnits(s.meters, u), u, false)}<small>${u}</small></b><span>Total ${u === 'mi' ? 'miles' : 'km'}</span></div>
      </section>` : ''}
      <button class="btn btn-green invite">${SEND_ICON} ${currentTeam() ? `Invite to ${esc(teamLabel(currentTeam()!))}` : 'Invite a friend'}</button>
      <h2 class="section">${today === 0 ? 'Preview' : 'Your doors'}</h2>
      <div class="grid">${LAYOUT.map(([d, size]) => door(d, size, today)).join('')}</div>
      <section class="board" aria-labelledby="board-h">
        <h2 class="section" id="board-h">${myTeams().length > 1 ? 'Your teams' : myTeams().length ? 'Your team' : 'Teams'}</h2>
        <div class="team-area"></div>
      </section>
      ${footer()}
    </main>`

  $('.gear').addEventListener('click', openSettings)
  document.querySelector('.admin-btn')?.addEventListener('click', openAdmin)
  $('.invite').addEventListener('click', invite)
  document.querySelectorAll<HTMLElement>('.door').forEach((el) =>
    el.addEventListener('click', () => openDoor(Number(el.dataset.day))),
  )
  document.querySelector('[data-open-today]')?.addEventListener('click', () => openDoor(today))
  document.querySelector('[data-share-today]')?.addEventListener('click', () => openShare(today))
  bindCommon()
  renderTeams()
  maybeAcceptInvite()

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
    ${quoteHtml(today)}
    <p class="target">${fmtDist(milesToUnits(t.miles, u), u)}</p>
    ${howHtml(today)}
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

const SEND_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`
const siteUrl = () => location.origin + import.meta.env.BASE_URL

async function invite() {
  const t = currentTeam()
  if (t) return inviteToTeam(t)
  const url = siteUrl()
  const text = `I'm doing ${APP_NAME}: 24 runs or walks, 1–5 miles on weekdays and long ones on weekends. Join me! 🎄 #${HASHTAG}`
  if (navigator.share) {
    try {
      return await navigator.share({ title: APP_NAME, text, url })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  open(`https://bsky.app/intent/compose?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank')
}

// ── teams ──
const teamInfo = new Map<string, Team | null>()
let members: Member[] | null = null
let membersAt = 0
let membersLoading = false
let membersError = false

const teamLabel = (uri: string) => {
  const t = teamInfo.get(uri)
  return t ? `${t.emoji} ${t.name}` : 'your team'
}

function currentTeam(): string | null {
  const teams = myTeams()
  if (!teams.length) return null
  const saved = localStorage.getItem(TEAM_KEY)
  return saved && teams.includes(saved) ? saved : teams[0]
}

async function getTeam(uri: string): Promise<Team | null> {
  if (teamInfo.has(uri)) return teamInfo.get(uri)!
  let t: Team | null = null
  if (isDemo && session) {
    const [, , did, collection, rkey] = uri.split('/')
    t = await session.agent.com.atproto.repo.getRecord({ repo: did, collection, rkey }).then((r) => r.data.value as unknown as Team).catch(() => null)
  } else {
    t = await loadTeam(uri)
  }
  teamInfo.set(uri, t)
  return t
}

function selfMember(): Member | null {
  if (profile?.showOnBoard === false || !session) return null
  const s = stats(days)
  const prev = members?.find((m) => m.isYou)
  return {
    did: session.did, handle: myHandle || prev?.handle || '', name: profile?.name || 'You', avatar: prev?.avatar,
    doors: s.doors, streak: s.streak, meters: s.meters, isYou: true, teams: myTeams(),
  }
}

async function renderTeams() {
  const area = document.querySelector<HTMLElement>('.team-area')
  if (!area) return
  const teams = myTeams()
  if (!teams.length) {
    area.innerHTML = `<div class="card solo">
      <p class="big-emoji">🏃</p>
      <h3>Running solo</h3>
      <p>Totally great! Want company? Start a team and send the invite link to friends. Or, if someone sent you a link, just open it to join their team.</p>
      <button class="btn btn-green" data-new-team>Start a team</button>
    </div>`
    $('[data-new-team]', area).addEventListener('click', openNewTeam)
    return
  }
  await Promise.all(teams.map(getTeam))
  const sel = currentTeam()!
  const chips = teams.length > 1 || true
    ? `<div class="team-chips" role="tablist">${teams
        .map((u) => `<button role="tab" aria-selected="${u === sel}" class="chip${u === sel ? ' on' : ''}" data-team="${esc(u)}">${esc(teamLabel(u))}</button>`)
        .join('')}<button class="chip add" data-new-team aria-label="Start another team">＋ New team</button></div>`
    : ''
  area.innerHTML = `${chips}
    <p class="plan-line">Plan: <b>${PLANS[planOf(sel)].label}</b> · ${PLANS[planOf(sel)].range}${sel.split('/')[2] === session!.did ? ' · <button class="link inline" data-change-plan>Change</button>' : ''}</p>
    <p class="board-sub">No rankings, just cheering each other on. 💛</p>
    <div class="board-list">${members ? boardHtml(sel) : '<div class="board-loading"><span class="spinner"></span> Gathering the crew…</div>'}</div>
    <div class="team-actions">
      <button class="btn btn-ghost" data-invite-team>${SEND_ICON} Invite to ${esc(teamLabel(sel))}</button>
      <button class="link" data-leave-team>Leave ${esc(teamLabel(sel))}</button>
    </div>`
  area.querySelectorAll<HTMLElement>('[data-team]').forEach((b) =>
    b.addEventListener('click', () => {
      localStorage.setItem(TEAM_KEY, b.dataset.team!)
      renderApp()
    }),
  )
  area.querySelector('[data-new-team]')?.addEventListener('click', openNewTeam)
  area.querySelector('[data-change-plan]')?.addEventListener('click', () => openChangePlan(sel))
  $('[data-invite-team]', area).addEventListener('click', () => inviteToTeam(sel))
  $<HTMLButtonElement>('[data-leave-team]', area).addEventListener('click', (e) => leaveTeam(sel, e.currentTarget as HTMLButtonElement))

  if (membersLoading || (members && Date.now() - membersAt < 120_000)) return
  membersLoading = true
  try {
    members = isDemo
      ? await demoBoard()
      : await loadMembers({ did: session!.did, profile: profile!, days }, roster)
    membersError = false
  } catch (e) {
    console.error('team board', e)
    membersError = true
    members ??= []
  } finally {
    membersAt = Date.now()
    membersLoading = false
  }
  const fresh = document.querySelector<HTMLElement>('.board-list')
  if (fresh) fresh.innerHTML = boardHtml(currentTeam()!)
}

function boardHtml(team: string) {
  const u = units()
  const me = selfMember()
  const list = [...(me ? [me] : []), ...(members ?? []).filter((m) => !m.isYou && m.teams.includes(team))]
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
    <ul>${rows}</ul>
    ${count <= 1 ? '<p class="small board-note">Just you so far. Send the invite link to bring friends in! 👇</p>' : ''}
    <p class="small board-note">✓ = on a streak (2+ days in a row)${membersError ? ' · Couldn’t reach everyone right now. Showing what we could.' : ''}</p>
    ${profile?.showOnBoard === false ? '<p class="small board-note">You’re hidden from team boards. Change it in Settings ⚙️</p>' : ''}`
}

const TEAM_EMOJI = ['🏃', '🎄', '⛄', '🦌', '🍪', '🔥', '⭐', '🏔️', '🐧', '☕']

function openNewTeam() {
  openSheet(`
    <h2>Start a team</h2>
    <p class="small">Pick a name, then send the invite link to friends. Anyone with the link can join.</p>
    <form class="new-team" novalidate>
      <label class="field"><span>Team name</span><input name="name" maxlength="40" placeholder="e.g. Hill Hustlers" required /></label>
      <div class="field"><span>Training plan</span>${planPicker('easy')}</div>
      <div class="field"><span>Pick an emoji</span>
        <div class="emoji-pick">${TEAM_EMOJI.map((e, i) => `<label><input type="radio" name="emoji" value="${e}" ${i === 0 ? 'checked' : ''}/><span>${e}</span></label>`).join('')}</div>
      </div>
      <p class="error" hidden></p>
      <button class="btn btn-green" type="submit">Create team</button>
    </form>`,
    (el) => {
      const form = $<HTMLFormElement>('form', el)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const fd = new FormData(form)
        const name = String(fd.get('name') ?? '').trim()
        if (!name) return showErr($('.error', form), 'Give your team a name.')
        const team: Team = { name, emoji: String(fd.get('emoji') || '🏃'), level: (fd.get('level') as Plan) || 'easy', createdAt: new Date().toISOString() }
        busy($<HTMLButtonElement>('button[type=submit]', form), 'Creating…', async () => {
          const uri = await createTeam(session!.agent, session!.did, team)
          teamInfo.set(uri, team)
          await setMembership(uri, true)
          localStorage.setItem(TEAM_KEY, uri)
          renderApp()
          inviteToTeam(uri, true)
        })
      })
    })
}

/** Join (true) or leave (false) a team, in my own profile record. */
function planPicker(selected: Plan) {
  return `<div class="plan-pick">${(Object.keys(PLANS) as Plan[])
    .map((p) => `<label><input type="radio" name="level" value="${p}" ${p === selected ? 'checked' : ''}/>
      <span><b>${PLANS[p].label}</b><small>${esc(PLANS[p].blurb)}</small></span></label>`)
    .join('')}</div>`
}

function openChangePlan(uri: string) {
  const team = teamInfo.get(uri)
  if (!team) return
  openSheet(`
    <p class="eyebrow">${esc(team.emoji)} ${esc(team.name)}</p>
    <h2>Team plan</h2>
    <form class="change-plan" novalidate>
      ${planPicker(team.level ?? 'easy')}
      <p class="small">Everyone on the team sees the new suggestions right away. Doors already opened keep the miles people logged.</p>
      <button class="btn btn-green" type="submit">Save plan</button>
    </form>`,
    (el) => {
      const form = $<HTMLFormElement>('form', el)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const level = (new FormData(form).get('level') as Plan) || 'easy'
        busy($<HTMLButtonElement>('button[type=submit]', form), 'Saving…', async () => {
          const next = { ...team, level }
          await updateTeam(session!.agent, uri, next)
          teamInfo.set(uri, next)
          closeSheet()
          renderApp()
          toast(`Plan set to ${PLANS[level].label}`)
        })
      })
    })
}

async function setMembership(uri: string, join: boolean) {
  const teams = profile!.teams ?? []
  const left = profile!.leftTeams ?? []
  const next: Profile = {
    ...profile!,
    teams: join ? [...new Set([...teams, uri])] : teams.filter((t) => t !== uri),
    leftTeams: join ? left.filter((t) => t !== uri) : [...new Set([...left, uri])],
  }
  await saveProfile(session!.agent, session!.did, next)
  profile = next
  members = null // reload boards with the new team list
  membersAt = 0
}

function inviteToTeam(uri: string, justCreated = false) {
  const link = `${siteUrl()}?team=${encodeURIComponent(teamCode(uri))}`
  const label = teamLabel(uri)
  const text = `Join my team ${label} in ${APP_NAME}! 24 runs or walks. 🎄 #${HASHTAG}`
  openSheet(`
    ${justCreated ? `<p class="eyebrow">Team created 🎉</p>` : ''}
    <h2>Invite to ${esc(label)}</h2>
    <p class="small">Anyone who opens this link and signs in joins the team.</p>
    <label class="field"><span>Invite link</span><input class="link-box" readonly value="${esc(link)}" /></label>
    <button class="btn btn-green" data-share-link>${SEND_ICON} Share invite</button>
    <button class="btn btn-blue" data-post-link>Post it on Bluesky 🦋</button>
    <button class="btn btn-ghost" data-copy-link>Copy link</button>`,
    (el) => {
      const box = $<HTMLInputElement>('.link-box', el)
      box.addEventListener('focus', () => box.select())
      $('[data-copy-link]', el).addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link)
          toast('Invite link copied 📋')
        } catch {
          box.select()
        }
      })
      $('[data-post-link]', el).addEventListener('click', () =>
        open(`https://bsky.app/intent/compose?text=${encodeURIComponent(`${text}\n${link}`)}`, '_blank'),
      )
      const shareBtn = $<HTMLButtonElement>('[data-share-link]', el)
      if (!navigator.share) shareBtn.hidden = true
      shareBtn.addEventListener('click', () => navigator.share({ title: `Join ${label}`, text, url: link }).catch(() => {}))
    })
}

async function leaveTeam(uri: string, btn: HTMLButtonElement) {
  if (!confirm(`Leave ${teamLabel(uri)}? You can rejoin anytime with the invite link.`)) return
  await busy(btn, 'Leaving…', async () => {
    await setMembership(uri, false)
    if (localStorage.getItem(TEAM_KEY) === uri) localStorage.removeItem(TEAM_KEY)
    renderApp()
    toast('You left the team')
  })
}

/** ?team=… links are remembered (so they survive the Bluesky sign-in round trip) and offered once signed in. */
function captureInvite() {
  const params = new URLSearchParams(location.search)
  const code = params.get('team')
  if (!code) return
  const uri = teamUri(code)
  if (uri) localStorage.setItem(INVITE_KEY, uri)
  params.delete('team')
  const q = params.toString()
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash)
}

async function maybeAcceptInvite() {
  const uri = localStorage.getItem(INVITE_KEY)
  if (!uri || !session || document.querySelector('.sheet-wrap')) return
  localStorage.removeItem(INVITE_KEY)
  if (isRemoved(roster, session.did, uri)) {
    const t = await getTeam(uri)
    return openSheet(`<p class="eyebrow">Team invite</p><h2>Can't join ${t ? esc(t.emoji + ' ' + t.name) : 'this team'}</h2>
      <p>The organizer has removed you from this team. If you think that's a mistake, reach out to @${esc(HOST_HANDLE)}.</p>
      <button class="btn btn-ghost" data-close>OK</button>`)
  }
  if (myTeams().includes(uri)) {
    localStorage.setItem(TEAM_KEY, uri)
    return toast(`You're already on ${teamLabel(uri)} 👍`)
  }
  const team = await getTeam(uri)
  if (!team) return toast('That team invite link doesn’t work anymore.', 'err')
  openSheet(`
    <p class="eyebrow">Team invite</p>
    <h2>Join ${esc(team.emoji)} ${esc(team.name)}?</h2>
    <p class="plan-line">Plan: <b>${PLANS[team.level ?? 'easy'].label}</b> · ${esc(PLANS[team.level ?? 'easy'].blurb)}</p>
    <p>Your teammates will see your name, days completed, streak and distance. You can leave anytime.</p>
    <button class="btn btn-green" data-join>Join the team</button>
    <button class="btn btn-ghost" data-close>Not now</button>`,
    (el) => {
      $<HTMLButtonElement>('[data-join]', el).addEventListener('click', (e) =>
        busy(e.currentTarget as HTMLButtonElement, 'Joining…', async () => {
          await setMembership(uri, true)
          localStorage.setItem(TEAM_KEY, uri)
          closeSheet()
          renderApp()
          toast(`Welcome to ${team.emoji} ${team.name}! 🎉`)
        }),
      )
    })
}

// ── demo helpers (dev only) ──
async function demoAll(): Promise<Member[]> {
  const d = await import('./demo')
  return d.demoEveryone(session!.did, profile!.teams ?? []).map((m) => ({ ...m, teams: effectiveTeams(m.did, { teams: m.teams, leftTeams: m.isYou ? profile!.leftTeams : [] }, roster) }))
}
async function demoBoard(): Promise<Member[]> {
  const mine = new Set(myTeams())
  return (await demoAll()).map((m) => ({ ...m, teams: m.teams.filter((t) => mine.has(t)) })).filter((m) => m.isYou || m.teams.length)
}

async function refreshRoster() {
  if (isDemo) {
    roster = await session!.agent.com.atproto.repo
      .getRecord({ repo: session!.did, collection: 'io.github.911idonotcode.runadvent.roster', rkey: 'self' })
      .then((r) => ({ ...emptyRoster(), ...(r.data.value as unknown as Roster) }))
      .catch(() => emptyRoster())
  } else {
    // Never let a slow roster lookup hold up the page.
    roster = await Promise.race([loadRoster(), new Promise<Roster>((r) => setTimeout(() => r(roster), 4000))])
  }
}

// ── admin overview (creator only) ──
const canEditRoster = () => isDemo || myHandle.toLowerCase() === ADMIN_HANDLES[0].toLowerCase()
const isAdmin = () =>
  ADMIN_HANDLES.map((h) => h.toLowerCase()).includes(myHandle.toLowerCase()) ||
  (isDemo && new URLSearchParams(location.search).has('demo-admin'))

async function openAdmin() {
  openSheet(`<p class="eyebrow">Admin · only you see this button</p><h2>Everyone</h2>
    <div class="admin-body"><div class="board-loading"><span class="spinner"></span> Counting everyone…</div></div>`,
    async (el) => {
      const body = $('.admin-body', el)
      let everyone: Member[]
      try {
        everyone = isDemo ? await demoAll() : await loadEveryone(session!.did, roster)
      } catch (e) {
        console.error(e)
        body.innerHTML = '<p class="error">Couldn’t load participants right now. Try again in a minute.</p>'
        return
      }
      const allTeams = [...new Set([...everyone.flatMap((m) => m.teams), ...roster.add.map((e) => e.team), ...(profile!.teams ?? [])])]
      await Promise.all(allTeams.map(getTeam))
      const u = units()
      const dist = (m: number) => fmtDist(Math.round(toUnits(m, u) * 10) / 10, u, false)
      const total = (f: (m: Member) => number, list = everyone) => list.reduce((n, m) => n + f(m), 0)
      const solo = everyone.filter((m) => !m.teams.length)
      const teamRows = allTeams
        .map((t) => ({ t, list: everyone.filter((m) => m.teams.includes(t)) }))
        .sort((a, b) => b.list.length - a.list.length || teamLabel(a.t).localeCompare(teamLabel(b.t)))
      const label = (t: string) => (teamInfo.get(t) ? teamLabel(t) : 'Deleted team')

      body.innerHTML = `
        <div class="admin-tiles">
          <div><b>${everyone.length}</b><span>Participants</span></div>
          <div><b>${everyone.length - solo.length}</b><span>On a team</span></div>
          <div><b>${solo.length}</b><span>Solo</span></div>
          <div><b>${allTeams.length}</b><span>Teams</span></div>
          <div><b>${total((m) => m.doors)}</b><span>Doors opened</span></div>
          <div><b>${dist(total((m) => m.meters))}</b><span>Total ${u === 'mi' ? 'miles' : 'km'}</span></div>
        </div>
        <h3 class="admin-h">Teams</h3>
        <div class="admin-table-wrap"><table class="admin-table">
          <thead><tr><th>Team</th><th>Plan</th><th>Members</th><th>Doors</th><th>${u}</th></tr></thead>
          <tbody>${teamRows.map(({ t, list }) => `<tr><td>${esc(label(t))}</td><td>${PLANS[planOf(t)].label}</td><td>${list.length}</td><td>${total((m) => m.doors, list)}</td><td>${dist(total((m) => m.meters, list))}</td></tr>`).join('')}
          <tr class="muted"><td>Solo (no team)</td><td>Own choice</td><td>${solo.length}</td><td>${total((m) => m.doors, solo)}</td><td>${dist(total((m) => m.meters, solo))}</td></tr></tbody>
        </table></div>
        <h3 class="admin-h">Participants</h3>
        <input class="admin-search" type="search" placeholder="Search name, handle or team" />
        <div class="admin-table-wrap"><table class="admin-table people">
          <thead><tr><th>Name</th><th>Teams</th><th>Days</th><th>${u}</th><th>Streak</th><th></th></tr></thead>
          <tbody>${everyone
            .map((m) => `<tr data-q="${esc((m.name + ' ' + m.handle + ' ' + m.teams.map(label).join(' ')).toLowerCase())}">
              <td><b>${esc(m.name)}</b>${m.handle ? `<br/><a href="https://bsky.app/profile/${esc(m.handle)}" target="_blank" rel="noopener">@${esc(m.handle)}</a>` : ''}</td>
              <td>${m.teams.length ? m.teams.map((t) => esc(label(t))).join('<br/>') : '<span class="muted">Solo</span>'}</td>
              <td>${m.doors}</td><td>${dist(m.meters)}</td><td>${m.streak >= 2 ? `✓ ${m.streak}` : '–'}</td>
              <td>${canEditRoster() ? `<button class="mini" data-edit="${esc(m.did)}">Edit teams</button>` : ''}</td></tr>`)
            .join('')}</tbody>
        </table></div>
        <button class="btn btn-ghost" data-csv>Download CSV</button>
        <p class="small">Includes everyone with a calendar profile, even people who hide from team boards. Updated when you open this.</p>`

      body.querySelectorAll<HTMLElement>('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => editMemberTeams(everyone.find((m) => m.did === b.dataset.edit)!, allTeams)),
      )
      const search = $<HTMLInputElement>('.admin-search', body)
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase()
        body.querySelectorAll<HTMLElement>('.people tbody tr').forEach((tr) => (tr.hidden = !!q && !tr.dataset.q!.includes(q)))
      })
      $('[data-csv]', body).addEventListener('click', () => {
        const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
        const lines = [
          ['Name', 'Handle', 'Teams', 'Days completed', `Total ${u}`, 'Current streak'].map(cell).join(','),
          ...everyone.map((m) => [m.name, m.handle ? '@' + m.handle : '', m.teams.map(label).join('; ') || 'Solo', m.doors, dist(m.meters), m.streak].map(cell).join(',')),
        ]
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
        a.download = `running-advent-participants-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
      })
    })
}

function editMemberTeams(m: Member, allTeams: string[]) {
  const label = (t: string) => (teamInfo.get(t) ? teamLabel(t) : 'Deleted team')
  openSheet(`
    <p class="eyebrow">Admin · edit teams</p>
    <h2>${esc(m.name)}</h2>
    ${m.handle ? `<p class="small">@${esc(m.handle)}</p>` : ''}
    ${allTeams.length ? `<form class="edit-teams">
      ${allTeams.map((t) => `<label class="check team-row">
        <input type="checkbox" name="team" value="${esc(t)}" ${m.teams.includes(t) ? 'checked' : ''} />
        <span>${esc(label(t))}${isRemoved(roster, m.did, t) ? ' <em class="removed">removed by you</em>' : ''}</span>
      </label>`).join('')}
      <p class="small">Adding someone puts them on that team's board. Removing them takes them off and stops them rejoining with the invite link. They're not notified.</p>
      <button class="btn btn-green" type="submit">Save</button>
    </form>` : '<p>No teams exist yet.</p>'}
    <button class="btn btn-ghost" data-back>Back to Admin</button>`,
    (el) => {
      $('[data-back]', el).addEventListener('click', openAdmin)
      const form = el.querySelector<HTMLFormElement>('form.edit-teams')
      form?.addEventListener('submit', (e) => {
        e.preventDefault()
        const want = new Set(new FormData(form).getAll('team').map(String))
        let next = roster
        for (const t of allTeams) {
          const isOn = m.teams.includes(t)
          if (want.has(t) !== isOn) next = rosterSet(next, m.did, t, want.has(t))
        }
        if (next === roster) return openAdmin()
        busy($<HTMLButtonElement>('button[type=submit]', form), 'Saving…', async () => {
          await saveRoster(session!.agent, session!.did, next)
          roster = next
          members = null
          membersAt = 0
          toast('Teams updated ✅')
          renderApp()
          openAdmin()
        })
      })
    })
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
      ${quoteHtml(day)}
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
    ${quoteHtml(day)}
    <p class="target-chip">Suggested: <b>${fmtDist(milesToUnits(t.miles, u), u)}</b>${t.kind === 'long' ? ' · run or walk' : ''} <span class="plan-tag">${PLANS[getPlan()].label}</span></p>
    ${howHtml(day)}
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
  const t = currentTeam()
  const input: CardInput = { rec, units: units(), streak: s.streak, doors: s.doors, photo: null, team: t && teamInfo.get(t) ? teamLabel(t) : undefined, handle: myHandle }

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
        return `${input.photo ? 'Run photo with' : `${APP_NAME} card with`} stats: ${parts.join(', ')}.`
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
      <div class="field"><span>Your plan when running solo${myTeams().length ? ' <em>(your team’s plan is used while a team is selected)</em>' : ''}</span>${planPicker(profile?.plan ?? 'easy')}</div>
      <div class="field inline"><span>Distance in</span>
        <div class="seg" role="radiogroup">
          <label><input type="radio" name="units" value="mi" ${u === 'mi' ? 'checked' : ''}/><span>Miles</span></label>
          <label><input type="radio" name="units" value="km" ${u === 'km' ? 'checked' : ''}/><span>Km</span></label>
        </div>
      </div>
      <label class="check board-toggle">
        <input type="checkbox" name="board" ${profile?.showOnBoard === false ? '' : 'checked'} />
        <span>Show me on my team boards<br/><small>Teammates see your name, days completed, streak and distance.</small></span>
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
          plan: (fd.get('level') as Plan) || 'easy',
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
        if (!confirm(`Delete all your ${APP_NAME} data from your Bluesky account? Posts you shared stay until you delete them in Bluesky. This can’t be undone.`)) return
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
  captureInvite()
  const stravaResult = handleStravaReturn() // must run before Bluesky sign-in reads the URL
  if (stravaResult) setTimeout(() => toast(stravaResult.msg, stravaResult.ok ? 'ok' : 'err'), 600)
  try {
    session = isDemo
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
    const [p, d] = await Promise.all([getProfile(session.agent, session.did), listDays(session.agent, session.did), refreshRoster()])
    days = d
    profile = p
    myHandle = await session.agent.getProfile({ actor: session.did }).then(({ data }) => data.handle).catch(() => '')
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
    await Promise.all(myTeams().map(getTeam)) // team plans decide the suggestions
    renderApp()
  } catch (e) {
    console.error(e)
    app.innerHTML = `${lights()}<main class="wrap"><section class="card center"><h3>Couldn't load your calendar</h3><p>${esc((e as Error).message)}</p><button class="btn btn-green" onclick="location.reload()">Try again</button></section></main>`
  }
}

boot()
