import { RichText, type Agent } from '@atproto/api'
import { APP_NAME, HASHTAG } from './config'
import { fmtDist, fmtDuration, fmtPace, target, toUnits } from './calendar'
import type { DayRecord, Units } from './data'

export const W = 1080
export const H = 1350 // 4:5 — works for Bluesky and the Instagram feed

export interface CardInput {
  rec: DayRecord
  units: Units
  streak: number
  doors: number
  photo: ImageBitmap | null
  /** e.g. "🏔️ Hill Hustlers", shown on the card and in the post. */
  team?: string
  /** Runner's own handle, shown when they're not on a team. */
  handle?: string
}

const C = {
  navy: '#0b1020',
  cream: '#f6efe3',
  gold: '#f4c34d',
  red: '#e5394a',
  ice: '#e3f0f8',
  muted: 'rgba(246,239,227,.72)',
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export async function loadPhoto(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
}

export async function drawCard(canvas: HTMLCanvasElement, input: CardInput) {
  await Promise.all([
    document.fonts.load('800 100px Gabarito'),
    document.fonts.load('600 40px Figtree'),
  ]).catch(() => {})

  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const { rec, units, photo } = input
  const t = target(rec.day)

  // ── background: photo (cover) or night sky ──
  ctx.fillStyle = C.navy
  ctx.fillRect(0, 0, W, H)
  if (photo) {
    const s = Math.max(W / photo.width, H / photo.height)
    const pw = photo.width * s
    const ph = photo.height * s
    ctx.drawImage(photo, (W - pw) / 2, (H - ph) / 2, pw, ph)
  } else {
    const g = ctx.createRadialGradient(W * 0.3, H * 0.35, 50, W * 0.5, H * 0.5, H)
    g.addColorStop(0, '#1d3a3a')
    g.addColorStop(0.5, '#141a33')
    g.addColorStop(1, C.navy)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    let seed = rec.day * 97
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    for (let i = 0; i < 90; i++) {
      ctx.beginPath()
      ctx.arc(rand() * W, rand() * H * 0.6, 2 + rand() * 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // legibility gradients
  let g = ctx.createLinearGradient(0, 0, 0, 300)
  g.addColorStop(0, 'rgba(8,11,24,.75)')
  g.addColorStop(1, 'rgba(8,11,24,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, 300)
  g = ctx.createLinearGradient(0, H * 0.42, 0, H)
  g.addColorStop(0, 'rgba(8,11,24,0)')
  g.addColorStop(0.45, 'rgba(8,11,24,.78)')
  g.addColorStop(1, 'rgba(8,11,24,.96)')
  ctx.fillStyle = g
  ctx.fillRect(0, H * 0.42, W, H * 0.58)

  // ── string of lights ──
  const bulbs = ['#f4c34d', '#e5394a', '#3fb7e8', '#18a66f', '#f4c34d', '#e5394a', '#3fb7e8', '#18a66f', '#f4c34d']
  ctx.strokeStyle = 'rgba(30,40,30,.9)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(0, 28)
  for (let i = 0; i <= 8; i++) ctx.quadraticCurveTo(i * 135 + 67, 58, (i + 1) * 135, 28)
  ctx.stroke()
  bulbs.forEach((c, i) => {
    const x = 60 + i * 120
    const y = 52 + (i % 2) * 6
    ctx.save()
    ctx.shadowColor = c
    ctx.shadowBlur = 28
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.ellipse(x, y + 22, 13, 19, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#2b3329'
    ctx.fillRect(x - 8, y - 2, 16, 10)
  })

  // ── gift badge with day number ──
  const bx = 64
  const by = 140
  const bs = 150
  ctx.save()
  ctx.shadowColor = 'rgba(244,195,77,.7)'
  ctx.shadowBlur = 30
  rr(ctx, bx, by, bs, bs, 30)
  ctx.fillStyle = C.ice
  ctx.fill()
  ctx.restore()
  ctx.lineWidth = 6
  ctx.strokeStyle = C.gold
  rr(ctx, bx, by, bs, bs, 30)
  ctx.stroke()
  ctx.save()
  rr(ctx, bx, by, bs, bs, 30)
  ctx.clip()
  ctx.fillStyle = C.red
  ctx.fillRect(bx, by + 34, bs, 22)
  ctx.fillRect(bx + 100, by, 22, bs)
  ctx.restore()
  ctx.fillStyle = '#ef5361'
  ctx.beginPath()
  ctx.arc(bx + 111, by + 45, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#121a2c'
  ctx.font = '800 76px Gabarito'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(String(rec.day), bx + 16, by + bs - 18)

  ctx.fillStyle = C.cream
  ctx.font = '800 44px Gabarito'
  ctx.fillText(`Day ${rec.day} of 24`, bx + bs + 30, by + 66)
  ctx.fillStyle = C.muted
  ctx.font = '600 32px Figtree'
  ctx.fillText(APP_NAME, bx + bs + 30, by + 114)
  drawWreath(ctx, bx + bs + 30 + ctx.measureText(APP_NAME).width + 42, by + 101, 19)

  // ── bottom block ──
  const dist = toUnits(rec.distanceMeters, units)
  let y = H - 470
  ctx.fillStyle = C.cream
  ctx.font = '800 46px Gabarito'
  ctx.fillText(t.title, 64, y)

  y += 150
  ctx.fillStyle = C.gold
  ctx.font = '800 170px Gabarito'
  const distStr = fmtDist(dist, units, false)
  ctx.fillText(distStr, 58, y)
  const dw = ctx.measureText(distStr).width
  ctx.font = '800 64px Gabarito'
  ctx.fillText(units, 58 + dw + 18, y)

  // stat chips
  const chips: [string, string][] = []
  if (rec.durationSeconds) chips.push(['TIME', fmtDuration(rec.durationSeconds)])
  if (rec.durationSeconds) chips.push(['PACE', fmtPace(rec.distanceMeters, rec.durationSeconds, units)])
  chips.push(['STREAK', `${input.streak} ${input.streak === 1 ? 'day' : 'days'}`])
  if (chips.length < 3) chips.push(['DOORS', `${input.doors}/24`])
  const gap = 18
  const cw = (W - 128 - gap * (chips.length - 1)) / chips.length
  y += 50
  chips.forEach(([label, value], i) => {
    const x = 64 + i * (cw + gap)
    rr(ctx, x, y, cw, 130, 26)
    ctx.fillStyle = 'rgba(32,40,64,.82)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,.12)'
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = C.cream
    ctx.font = '800 48px Gabarito'
    ctx.fillText(value, x + cw / 2, y + 66, cw - 24)
    ctx.fillStyle = C.muted
    ctx.font = '700 22px Figtree'
    ctx.fillText(label.split('').join(String.fromCharCode(8202)), x + cw / 2, y + 104)
    ctx.textAlign = 'left'
  })

  // footer
  ctx.fillStyle = C.muted
  ctx.font = '600 30px Figtree'
  ctx.fillText(input.team || (input.handle ? `@${input.handle}` : APP_NAME), 64, H - 62, W - 128 - 260)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.gold
  ctx.fillText(`#${HASHTAG}`, W - 64, H - 62)
  ctx.textAlign = 'left'

  // candy stripe
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, H - 22, W, 22)
  ctx.clip()
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, H - 22, W, 22)
  ctx.fillStyle = C.red
  for (let x = -40; x < W + 40; x += 44) {
    ctx.beginPath()
    ctx.moveTo(x, H)
    ctx.lineTo(x + 22, H)
    ctx.lineTo(x + 44, H - 22)
    ctx.lineTo(x + 22, H - 22)
    ctx.fill()
  }
  ctx.restore()
}

function drawWreath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save()
  ctx.lineWidth = r * 0.55
  ctx.strokeStyle = '#1f7a4a'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = r * 0.25
  ctx.strokeStyle = '#2fa266'
  ctx.setLineDash([r * 0.35, r * 0.3])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#e5394a'
  for (const a of [0.6, 1.9, 3.3, 4.4, 5.6]) {
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.16, 0, Math.PI * 2)
    ctx.fill()
  }
  const by = y + r
  ctx.beginPath()
  ctx.moveTo(x, by)
  ctx.lineTo(x - r * 0.55, by - r * 0.3)
  ctx.lineTo(x - r * 0.55, by + r * 0.3)
  ctx.closePath()
  ctx.moveTo(x, by)
  ctx.lineTo(x + r * 0.55, by - r * 0.3)
  ctx.lineTo(x + r * 0.55, by + r * 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** JPEG under Bluesky's 1 MB image limit. */
export async function toJpeg(canvas: HTMLCanvasElement, maxBytes = 950_000): Promise<Blob> {
  for (const q of [0.92, 0.85, 0.78, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', q))
    if (blob.size <= maxBytes) return blob
  }
  const small = document.createElement('canvas')
  small.width = W * 0.75
  small.height = H * 0.75
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height)
  return new Promise<Blob>((res) => small.toBlob((b) => res(b!), 'image/jpeg', 0.8))
}

export function defaultPostText(input: CardInput): string {
  const { rec, units } = input
  const parts = [fmtDist(toUnits(rec.distanceMeters, units), units)]
  if (rec.durationSeconds) {
    parts.push(fmtDuration(rec.durationSeconds))
    parts.push(fmtPace(rec.distanceMeters, rec.durationSeconds, units))
  }
  const lines = [
    `🎁 Day ${rec.day} of ${APP_NAME}: done!${input.team ? ` Team ${input.team}` : ''}`,
    `🏃 ${parts.join(' · ')}`,
  ]
  if (input.streak > 1) lines.push(`🔥 ${input.streak}-day streak`)
  lines.push('', `#${HASHTAG}`)
  return lines.join('\n')
}

export function graphemeLength(text: string) {
  return new RichText({ text }).graphemeLength
}

export async function postToBluesky(agent: Agent, text: string, image: Blob, alt: string) {
  const rt = new RichText({ text })
  await rt.detectFacets(agent) // links, #tags and @mentions
  const { data } = await agent.uploadBlob(new Uint8Array(await image.arrayBuffer()), { encoding: 'image/jpeg' })
  const res = await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{ image: data.blob, alt, aspectRatio: { width: W, height: H } }],
    },
    createdAt: new Date().toISOString(),
  })
  return res.uri
}

/** bsky.app URL for an at:// post URI. */
export function postUrl(uri: string) {
  const [, , did, , rkey] = uri.split('/')
  return `https://bsky.app/profile/${did}/post/${rkey}`
}

/** Opens the native share sheet (Instagram, Messages, …) or downloads the image. */
export async function shareImage(image: Blob, day: number, caption: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([image], `run-advent-day-${day}.jpg`, { type: 'image/jpeg' })
  try {
    await navigator.clipboard?.writeText(caption)
  } catch {
    /* clipboard is a nice-to-have */
  }
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return 'downloaded'
}
