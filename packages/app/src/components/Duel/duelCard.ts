import type { DuelComponent, DuelVerdict } from '@/arcade/duelJudge'
import type { DuelResult } from '@/arcade/duelResult'

/**
 * The card's geometry, in card-local pixels at 1x.
 *
 * One table, read by both the DOM card and the canvas routine that draws the
 * PNG. Two layouts that merely look alike drift the first time one of them is
 * nudged, and the PNG is the half nobody looks at until it is shared.
 */
export const CARD = {
  width: 540,
  height: 780,
  radius: 24,
  padding: 44,
  /** The winner-tinted stroke. Nothing may sit on it. */
  rim: { inset: 19, width: 3, radius: 14 },
  badge: { x: 40, y: 30, width: 74, height: 82, outline: 2, glyph: 46 },
  titleBar: { x: 104, y: 40, width: 392, height: 60, radius: 12 },
  title: { size: 32, baseline: 80 },
  /* Starts below the badge, not below the title bar: the badge hangs past the
     bar's bottom edge and the window is full width. */
  window: { x: 44, y: 118, width: 452, height: 392, radius: 18, border: 4 },
  rows: {
    x: 44,
    y: 524,
    width: 452,
    /*
     * 36 at a pitch of 42, not the spec's 41 at 49: five of those start at 532
     * and end at 769, which is eleven pixels past the rim's inner edge and
     * straight through the watermark. The rim is the one line nothing may
     * cross, so the rows gave up the difference and the window gave up eight.
     */
    height: 36,
    pitch: 42,
    radius: 13,
    border: 2,
    /** Left and right numeral columns. */
    value: 56,
    gap: 10,
    /** The seam sits at the row's centre and is always visible. */
    divider: 2,
  },
  watermark: { right: 496, baseline: 746, size: 13 },
  close: { x: 466, y: 30, size: 24 },
} as const

/** The still, at twice the window it fills. */
export const STILL = { width: 904, height: 784 } as const

/** The exported card, at twice the DOM card. */
export const CARD_SCALE = 2

/**
 * Quality is the flame's convergence target, not PNG compression — the blob
 * is written lossless either way. It follows whatever the viewer has set,
 * floored so a shared card is never grainy and capped so it is never an
 * ultra-length render.
 */
export const CARD_QUALITY_FLOOR = 0.97
export const CARD_QUALITY_CEIL = 0.99
export const CARD_STILL_DEADLINE_MS = 12_000

export function cardQuality(viewerQuality: number): number {
  return Math.min(
    CARD_QUALITY_CEIL,
    Math.max(CARD_QUALITY_FLOOR, viewerQuality),
  )
}

export type CardSide = 'player' | 'rival' | 'draw'

export type CardRow = {
  label: string
  player: number
  rival: number
  /** 0-1 of the half-track, per side. */
  playerFill: number
  rivalFill: number
  /** The totals row is set heavier: it is the headline of the block. */
  headline: boolean
}

export type DuelCardModel = {
  winner: CardSide
  /** The winner's own name, or who they are when they have none. */
  title: string
  rows: readonly CardRow[]
}

/** Components are 0-10 by construction: `10 * raw / (raw + half)` never gets there. */
const COMPONENT_MAX = 10

function componentRow(component: DuelComponent): CardRow {
  return {
    label: component.label,
    player: component.player,
    rival: component.rival,
    // Magnitude, not just ratio. A ratio alone drew 0.0 against 0.0 as two
    // half-tracks, identical to 4.7 against 4.7.
    playerFill: component.player / COMPONENT_MAX,
    rivalFill: component.rival / COMPONENT_MAX,
    headline: false,
  }
}

function scoreRow(verdict: DuelVerdict): CardRow {
  // Against the leader, so the winner always reaches the tip and the loser is
  // shorter by the margin the eye is meant to read.
  const top = Math.max(verdict.playerScore, verdict.rivalScore)
  const share = (value: number) => (top === 0 ? 0 : value / top)
  return {
    label: 'Score',
    player: verdict.playerScore,
    rival: verdict.rivalScore,
    playerFill: share(verdict.playerScore),
    rivalFill: share(verdict.rivalScore),
    headline: true,
  }
}

export function toCardModel(result: DuelResult): DuelCardModel {
  const { verdict } = result
  const winner: CardSide = verdict.winner
  return {
    winner,
    title:
      winner === 'draw'
        ? 'Dead heat'
        : winner === 'rival'
          ? result.rivalName
          : result.playerName,
    rows: [...verdict.components.map(componentRow), scoreRow(verdict)],
  }
}

/** Warm for the viewer, cool for the agent, matching the ring and the pills. */
export const CARD_COLORS = {
  player: '#fed798',
  rival: '#95f1fd',
  playerValue: '#ffeccb',
  rivalValue: '#d6fbff',
  body: '#05070d',
  window: '#010409',
  row: '#050608',
  /* The pale slate of the flame window, not a dark line: dark-on-dark vanished
     on a row where neither side scored, which is the one case it exists for. */
  seam: 'rgba(120,140,167,0.9)',
  /* The label's outline stays dark — it is what makes the word readable over
     a bright fill. */
  labelOutline: '#04060b',
} as const

export function rimColor(winner: CardSide): string {
  return winner === 'rival'
    ? CARD_COLORS.rival
    : winner === 'player'
      ? CARD_COLORS.player
      : '#f4f6ff'
}

/** Vertical title gradients, in the rim's hue. */
const TITLE_GRADIENT: Record<CardSide, readonly [string, string]> = {
  player: ['#ffd9a0', '#e88a4e'],
  rival: ['#dff6ff', '#6fd6ec'],
  draw: ['#f4f6ff', '#9aa6b8'],
}

/**
 * Seam to tip, brightest at the tip.
 *
 * The v1 pill ran these the other way and pulled the eye to the middle of the
 * row, which is the one place a tug-of-war bar says nothing.
 */
const FILL_STOPS = {
  player: ['#8f6d7b', '#d0825b', '#fed798'],
  rival: ['#3a4a72', '#4f8fb0', '#95f1fd'],
} as const

/** The `variation-spiral` icon's path, in its own 24x24 box. */
const SPIRAL_PATH =
  'M12 12A1.5 1.5 0 0 1 12 9A3 3 0 0 1 12 15A4.5 4.5 0 0 1 12 6A6 6 0 0 1 12 18'

const INTER = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
export const DISPLAY_FACE = "'Cinzel Decorative', 'Times New Roman', serif"

/** The faces `drawDuelCard` sets. Load these before it runs, or canvas
 *  silently substitutes the default serif into a card nobody re-checks. */
export const CARD_FONTS = [
  `700 ${CARD.title.size}px ${DISPLAY_FACE}`,
  `700 ${CARD.watermark.size}px ${DISPLAY_FACE}`,
  `600 20px ${INTER}`,
] as const

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/**
 * Stroke a box the way CSS draws a border: inside the box, not straddling it.
 *
 * A canvas stroke is centred on its path, so stroking the same rectangle a CSS
 * `border` describes puts half the line outside it. On the flame window that
 * was four pixels of frame the DOM card does not have, and the opening came
 * out three pixels wider per side.
 */
function strokeInside(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  width: number,
): void {
  const half = width / 2
  ctx.beginPath()
  ctx.roundRect(x + half, y + half, w - width, h - width, Math.max(0, r - half))
  ctx.lineWidth = width
  ctx.stroke()
}

/** CSS tracks letters; canvas does not, unless it is told to. */
function tracking(
  ctx: CanvasRenderingContext2D,
  em: number,
  size: number,
): void {
  ctx.letterSpacing = `${em * size}px`
}

function hexagonPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + w / 2, y)
  ctx.lineTo(x + w, y + h * 0.25)
  ctx.lineTo(x + w, y + h * 0.75)
  ctx.lineTo(x + w / 2, y + h)
  ctx.lineTo(x, y + h * 0.75)
  ctx.lineTo(x, y + h * 0.25)
  ctx.closePath()
}

/** Fit `text` inside `max`, ellipsised. A flame name has no length limit. */
function clip(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
): string {
  if (ctx.measureText(text).width <= max) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

function paintRim(ctx: CanvasRenderingContext2D, winner: CardSide): void {
  const { inset, width, radius } = CARD.rim
  const w = CARD.width - inset * 2
  const h = CARD.height - inset * 2
  let stroke: string | CanvasGradient = rimColor(winner)
  if (winner === 'draw') {
    // Half the card each, with the seam left hard: a draw is two results, not
    // a blend of them.
    const split = ctx.createLinearGradient(inset, 0, inset + w, 0)
    split.addColorStop(0, CARD_COLORS.player)
    split.addColorStop(0.48, CARD_COLORS.player)
    split.addColorStop(0.52, CARD_COLORS.rival)
    split.addColorStop(1, CARD_COLORS.rival)
    stroke = split
  }
  ctx.save()
  ctx.strokeStyle = stroke
  ctx.shadowColor = rimColor(winner)
  ctx.shadowBlur = 18
  strokeInside(ctx, inset, inset, w, h, radius, width)
  ctx.restore()
}

function paintBadge(ctx: CanvasRenderingContext2D, model: DuelCardModel): void {
  const { x, y, width, height, outline, glyph } = CARD.badge
  const rim = rimColor(model.winner)
  ctx.save()
  // Two hexagons, as in the stylesheet: the outline is the larger one behind.
  hexagonPath(
    ctx,
    x - outline,
    y - outline,
    width + outline * 2,
    height + outline * 2,
  )
  ctx.fillStyle = rim
  ctx.fill()
  hexagonPath(ctx, x, y, width, height)
  ctx.fillStyle = '#080b13'
  ctx.fill()

  // The glyph alone, at the size the hexagon can hold. The archetype word used
  // to sit under it and meant nothing to anyone reading the card.
  const scale = glyph / 24
  ctx.translate(x + (width - glyph) / 2, y + (height - glyph) / 2)
  ctx.scale(scale, scale)
  ctx.strokeStyle = model.winner === 'draw' ? 'rgba(244,246,255,0.7)' : rim
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(SPIRAL_PATH))
  ctx.restore()
}

function paintTitle(ctx: CanvasRenderingContext2D, model: DuelCardModel): void {
  const bar = CARD.titleBar
  ctx.save()
  roundRectPath(ctx, bar.x, bar.y, bar.width, bar.height, bar.radius)
  ctx.fillStyle = '#07090f'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  strokeInside(ctx, bar.x, bar.y, bar.width, bar.height, bar.radius, 1)

  const [from, to] = TITLE_GRADIENT[model.winner]
  const ink = ctx.createLinearGradient(0, bar.y + 12, 0, bar.y + bar.height - 8)
  ink.addColorStop(0, from)
  ink.addColorStop(1, to)
  ctx.font = `700 ${CARD.title.size}px ${DISPLAY_FACE}`
  tracking(ctx, 0.02, CARD.title.size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = ink
  ctx.shadowColor = from
  ctx.shadowBlur = 14
  // The badge overlaps the bar's left end by 10px, as in the mock, so the text
  // is inset past it rather than centred on a box it does not fully own.
  const inner = bar.width - 40
  ctx.fillText(
    clip(ctx, model.title, inner),
    bar.x + bar.width / 2 + 8,
    CARD.title.baseline,
  )
  ctx.restore()
}

function paintWindow(
  ctx: CanvasRenderingContext2D,
  still: CanvasImageSource | undefined,
  stillWidth: number,
  stillHeight: number,
): void {
  const win = CARD.window
  ctx.save()
  roundRectPath(ctx, win.x, win.y, win.width, win.height, win.radius)
  ctx.fillStyle = CARD_COLORS.window
  ctx.fill()
  if (still && stillWidth > 0 && stillHeight > 0) {
    ctx.save()
    ctx.clip()
    // Cover: fill the window, crop the overhang, keep the centre.
    const factor = Math.max(win.width / stillWidth, win.height / stillHeight)
    const w = stillWidth * factor
    const h = stillHeight * factor
    ctx.drawImage(
      still,
      win.x + (win.width - w) / 2,
      win.y + (win.height - h) / 2,
      w,
      h,
    )
    ctx.restore()
  }
  ctx.strokeStyle = 'rgba(120,140,167,0.9)'
  strokeInside(ctx, win.x, win.y, win.width, win.height, win.radius, win.border)
  ctx.restore()
}

/** Half the bar, per side. */
export const HALF_TRACK =
  (CARD.rows.width - CARD.rows.value * 2 - CARD.rows.gap * 2) / 2

function paintRow(
  ctx: CanvasRenderingContext2D,
  row: CardRow,
  y: number,
): void {
  const r = CARD.rows
  ctx.save()
  roundRectPath(ctx, r.x, y, r.width, r.height, r.radius)
  ctx.fillStyle = CARD_COLORS.row
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  strokeInside(ctx, r.x, y, r.width, r.height, r.radius, r.border)
  roundRectPath(ctx, r.x, y, r.width, r.height, r.radius)

  const seam = r.x + r.width / 2
  const top = y + r.border
  const height = r.height - r.border * 2
  ctx.save()
  ctx.clip()
  for (const side of ['player', 'rival'] as const) {
    const fill = side === 'player' ? row.playerFill : row.rivalFill
    const length = Math.max(0, Math.min(1, fill)) * HALF_TRACK
    if (length <= 0) continue
    const direction = side === 'player' ? -1 : 1
    const tip = seam + direction * length
    const ramp = ctx.createLinearGradient(seam, 0, tip, 0)
    const stops = FILL_STOPS[side]
    ramp.addColorStop(0, stops[0])
    ramp.addColorStop(0.55, stops[1])
    ramp.addColorStop(1, stops[2])
    ctx.fillStyle = ramp
    ctx.fillRect(Math.min(seam, tip), top, length, height)
  }
  // Permanent, so the meeting point reads even when both fills match.
  ctx.fillStyle = CARD_COLORS.seam
  ctx.fillRect(seam - r.divider / 2, top, r.divider, height)
  ctx.restore()

  const middle = y + r.height / 2
  ctx.textBaseline = 'middle'
  ctx.font = `${row.headline ? '600 21' : '19'}px ${INTER}`
  tracking(ctx, 0, 0)
  ctx.textAlign = 'left'
  ctx.fillStyle = CARD_COLORS.playerValue
  // 14, not 12: the DOM insets from the padding box, inside the 2px border.
  ctx.fillText(format(row.player, row.headline), r.x + 14, middle)
  ctx.textAlign = 'right'
  ctx.fillStyle = CARD_COLORS.rivalValue
  ctx.fillText(format(row.rival, row.headline), r.x + r.width - 14, middle)

  // stroke then fill IS `paint-order: stroke fill`: the label keeps a dark
  // outline over whichever fill has reached the seam.
  ctx.textAlign = 'center'
  ctx.font = `${row.headline ? '600 16' : '15'}px ${INTER}`
  tracking(ctx, 0.06, row.headline ? 16 : 15)
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = CARD_COLORS.labelOutline
  ctx.strokeText(row.label, seam, middle)
  ctx.fillStyle = '#e8ecf3'
  ctx.fillText(row.label, seam, middle)
  ctx.restore()
}

/** Components read to one decimal; the totals are whole points. */
export function format(value: number, headline: boolean): string {
  return headline ? String(Math.round(value)) : value.toFixed(1)
}

/**
 * The whole card, in one pass, at `scale`.
 *
 * The DOM card and this routine read the same `CARD` table, so a nudge to one
 * moves the other. Nothing here touches the DOM or the app's stores: give it a
 * context, a model and a still, and it draws.
 */
export function drawDuelCard(
  ctx: CanvasRenderingContext2D,
  model: DuelCardModel,
  still: CanvasImageSource | undefined,
  scale: number,
  stillSize: { width: number; height: number } = STILL,
): void {
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, CARD.width, CARD.height)

  roundRectPath(ctx, 0, 0, CARD.width, CARD.height, CARD.radius)
  ctx.fillStyle = CARD_COLORS.body
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  strokeInside(ctx, 0, 0, CARD.width, CARD.height, CARD.radius, 1)

  paintRim(ctx, model.winner)
  // The bar first: the badge overlaps its left end by ten pixels, as in the
  // mock and as the stylesheet stacks them.
  paintTitle(ctx, model)
  paintBadge(ctx, model)

  paintWindow(ctx, still, stillSize.width, stillSize.height)

  model.rows.forEach((row, index) => {
    paintRow(ctx, row, CARD.rows.y + index * CARD.rows.pitch)
  })

  ctx.save()
  ctx.font = `700 ${CARD.watermark.size}px ${DISPLAY_FACE}`
  tracking(ctx, 0.06, CARD.watermark.size)
  ctx.fillStyle = 'rgba(244,246,255,0.45)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Lumen Apeiron', CARD.watermark.right, CARD.watermark.baseline)
  ctx.restore()

  ctx.restore()
}
