import ui from '../ArenaOverlay.module.css'
import type { ArenaFighterStats } from '@/commands/types'
import type { FlameSchool, GroundedFlameStats } from '@/flame/stats'

export const SCHOOL_COLORS: Record<
  FlameSchool,
  { bg: string; text: string; border: string }
> = {
  Order: {
    bg: 'rgba(56, 189, 248, 0.15)',
    text: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.4)',
  },
  Crystal: {
    bg: 'rgba(52, 211, 153, 0.15)',
    text: '#34d399',
    border: 'rgba(52, 211, 153, 0.4)',
  },
  Void: {
    bg: 'rgba(192, 132, 252, 0.15)',
    text: '#c084fc',
    border: 'rgba(192, 132, 252, 0.4)',
  },
  Vortex: {
    bg: 'rgba(248, 113, 113, 0.15)',
    text: '#f87171',
    border: 'rgba(248, 113, 113, 0.4)',
  },
  Tide: {
    bg: 'rgba(45, 212, 191, 0.15)',
    text: '#2dd4bf',
    border: 'rgba(45, 212, 191, 0.4)',
  },
  Arcane: {
    bg: 'rgba(251, 191, 36, 0.15)',
    text: '#fbbf24',
    border: 'rgba(251, 191, 36, 0.4)',
  },
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }
}

/**
 * How long the export waits for the victor's artwork before drawing the card
 * without it. canvas.toBlob on a WebGPU canvas can simply never call back --
 * a lost device, a backgrounded tab -- and the export button then stayed on
 * "Exporting" for good, because nothing else ever settled the wait.
 */
export const VICTOR_IMAGE_TIMEOUT_MS = 4000

export function getVictorImage(
  isWinner1: boolean,
  timeoutMs = VICTOR_IMAGE_TIMEOUT_MS,
): Promise<HTMLImageElement | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const gaveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null)
    }, timeoutMs)
  })
  return Promise.race([findVictorImage(isWinner1), gaveUp]).finally(() => {
    clearTimeout(timer)
  })
}

function findVictorImage(isWinner1: boolean): Promise<HTMLImageElement | null> {
  const cardSelector = isWinner1 ? `.${ui.p1Card}` : `.${ui.p2Card}`
  const targetCard = document.querySelector<HTMLElement>(cardSelector)
  const winnerContainer = document.querySelector<HTMLElement>(
    `.${ui.winnerArtContainer}`,
  )
  const candidateContainers = [winnerContainer, targetCard].filter(
    Boolean,
  ) as HTMLElement[]

  if (candidateContainers.length === 0) return Promise.resolve(null)

  // 1. Try converged snapshot background URL first (most reliable)
  for (const container of candidateContainers) {
    const previewDiv =
      container.querySelector<HTMLElement>('[data-preview-state]') || container
    const bg =
      previewDiv.style.getPropertyValue('--background') ||
      previewDiv.style.backgroundImage
    const match = bg ? bg.match(/url\(['"]?(.*?)['"]?\)/) : null
    if (match && match[1]) {
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          resolve(img)
        }
        img.onerror = () => {
          resolve(null)
        }
        img.src = match[1]!
      })
    }
  }

  // 2. Fall back to canvas toBlob if snapshot not available yet
  for (const container of candidateContainers) {
    const canvas = container.querySelector<HTMLCanvasElement>('canvas')
    if (canvas) {
      return new Promise((resolve) => {
        try {
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve(null)
              return
            }
            const img = new Image()
            const url = URL.createObjectURL(blob)
            img.onload = () => {
              URL.revokeObjectURL(url)
              resolve(img)
            }
            img.onerror = () => {
              URL.revokeObjectURL(url)
              resolve(null)
            }
            img.src = url
          }, 'image/png')
        } catch {
          resolve(null)
        }
      })
    }
  }

  return Promise.resolve(null)
}

export interface DrawChampionCardOptions {
  readonly victor: ArenaFighterStats
  readonly rival: ArenaFighterStats | null
  readonly grounded: GroundedFlameStats
  readonly winStreak: number
  readonly stance: string
  readonly thumbnailImg?: HTMLImageElement | null
}

export function drawChampionCard(
  canvas: HTMLCanvasElement,
  options: DrawChampionCardOptions,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = 540
  const H = 780
  const schoolColor = SCHOOL_COLORS[options.grounded.school]?.text || '#38bdf8'

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
  bgGrad.addColorStop(0, '#0a0e1a')
  bgGrad.addColorStop(0.35, '#0f172a')
  bgGrad.addColorStop(0.7, '#1e1b4b')
  bgGrad.addColorStop(1, '#030712')
  ctx.fillStyle = bgGrad
  drawRoundedRect(ctx, 0, 0, W, H, 24)
  ctx.fill()

  // Outer border
  ctx.lineWidth = 3
  ctx.strokeStyle = schoolColor
  drawRoundedRect(ctx, 4, 4, W - 8, H - 8, 20)
  ctx.stroke()

  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  drawRoundedRect(ctx, 10, 10, W - 20, H - 20, 16)
  ctx.stroke()

  // Top header
  ctx.font = 'bold 12px monospace'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText('CHAOS MASTER • ARENA CHAMPION', 24, 34)

  // Win streak pill
  const streakText = `STREAK: ${options.winStreak} ${options.winStreak === 1 ? 'WIN' : 'WINS'}`
  ctx.font = 'bold 11px system-ui, sans-serif'
  const streakW = ctx.measureText(streakText).width + 16
  ctx.fillStyle = 'rgba(245, 158, 11, 0.2)'
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 1
  drawRoundedRect(ctx, W - 24 - streakW, 20, streakW, 20, 10)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#fbbf24'
  ctx.fillText(streakText, W - 24 - streakW + 8, 34)

  // Artwork Container
  const artX = 24
  const artY = 48
  const artW = W - 48
  const artH = 290

  ctx.fillStyle = '#020617'
  drawRoundedRect(ctx, artX, artY, artW, artH, 14)
  ctx.fill()

  // Draw victor preview image if available
  if (options.thumbnailImg && options.thumbnailImg.naturalWidth > 0) {
    ctx.save()
    drawRoundedRect(ctx, artX, artY, artW, artH, 14)
    ctx.clip()
    const img = options.thumbnailImg
    const aspect = img.naturalWidth / img.naturalHeight
    const targetAspect = artW / artH
    let dw = artW
    let dh = artH
    let dx = artX
    let dy = artY
    if (aspect > targetAspect) {
      dw = artH * aspect
      dx = artX + (artW - dw) / 2
    } else {
      dh = artW / aspect
      dy = artY + (artH - dh) / 2
    }
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
  } else {
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i < artW; i += 20) {
      ctx.beginPath()
      ctx.moveTo(artX + i, artY)
      ctx.lineTo(artX + i, artY + artH)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Artwork frame
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
  drawRoundedRect(ctx, artX, artY, artW, artH, 14)
  ctx.stroke()

  // School badge overlay
  const schoolBadgeText = `SCHOOL: ${options.grounded.school.toUpperCase()}`
  ctx.font = 'bold 11px system-ui, sans-serif'
  const badgeW = ctx.measureText(schoolBadgeText).width + 16
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.strokeStyle = schoolColor
  ctx.lineWidth = 1.5
  drawRoundedRect(ctx, artX + 12, artY + 12, badgeW, 24, 6)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = schoolColor
  ctx.fillText(schoolBadgeText, artX + 20, artY + 28)

  // Victor name & class
  const nameY = 372
  ctx.font = 'bold 24px system-ui, sans-serif'
  ctx.fillStyle = '#ffffff'
  const victorName = options.victor.name || 'Unknown Champion'
  ctx.fillText(victorName, 24, nameY)

  ctx.font = '13px system-ui, sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(
    `Class: ${options.victor.type || 'Fractal Guardian'}`,
    24,
    nameY + 22,
  )

  // Power level badge
  const pwrText = `PWR ${options.grounded.powerLevel}`
  ctx.font = 'bold 14px monospace'
  const pwrW = ctx.measureText(pwrText).width + 18
  ctx.fillStyle = 'rgba(34, 211, 238, 0.15)'
  ctx.strokeStyle = '#22d3ee'
  ctx.lineWidth = 1.5
  drawRoundedRect(ctx, W - 24 - pwrW, nameY - 20, pwrW, 28, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#38bdf8'
  ctx.fillText(pwrText, W - 24 - pwrW + 9, nameY)

  // Combat stats (HP, ATK, DEF, CRIT)
  const combatY = 432
  const cStats = [
    { label: 'HP', val: options.grounded.hp, color: '#4ade80' },
    { label: 'ATK', val: options.grounded.atk, color: '#f87171' },
    { label: 'DEF', val: options.grounded.def, color: '#60a5fa' },
    {
      label: 'CRIT',
      val: `${Math.round(options.grounded.critChance * 100)}%`,
      color: '#fbbf24',
    },
  ]
  const colW = (W - 48) / 4
  cStats.forEach((st, idx) => {
    const cx = 24 + idx * colW
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    drawRoundedRect(ctx, cx, combatY, colW - 6, 44, 8)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText(st.label, cx + 10, combatY + 16)

    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = st.color
    ctx.fillText(String(st.val), cx + 10, combatY + 35)
  })

  // Grounded mathematical properties
  const statsStartY = 496
  ctx.font = 'bold 10px monospace'
  ctx.fillStyle = '#64748b'
  ctx.fillText('GROUNDED MATHEMATICAL PROPERTIES', 24, statsStartY)

  const gMetrics = [
    {
      label: 'Moran Dimension (D)',
      val: options.grounded.dimension.toFixed(3),
      pct: (options.grounded.dimension / 3.0) * 100,
      color: '#38bdf8',
    },
    {
      label: 'IFS Contractivity / Stability',
      val: `${Math.round(options.grounded.stability * 100)}%`,
      pct: options.grounded.stability * 100,
      color: '#34d399',
    },
    {
      label: 'Weight Shannon Entropy',
      val: options.grounded.entropy.toFixed(3),
      pct: (options.grounded.entropy / 2.5) * 100,
      color: '#c084fc',
    },
    {
      label: 'Nonlinear Energy Ratio',
      val: `${Math.round(options.grounded.nonlinearity * 100)}%`,
      pct: options.grounded.nonlinearity * 100,
      color: '#f472b6',
    },
    {
      label: 'Rotational Symmetry Order',
      val: `C${options.grounded.symmetryOrder}`,
      pct: (options.grounded.symmetryOrder / 8) * 100,
      color: '#facc15',
    },
  ]

  gMetrics.forEach((m, idx) => {
    const rowY = statsStartY + 14 + idx * 36
    ctx.font = '11px system-ui, sans-serif'
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText(m.label, 24, rowY + 12)

    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = '#f8fafc'
    const valStr = m.val
    const valW = ctx.measureText(valStr).width
    ctx.fillText(valStr, W - 24 - valW, rowY + 12)

    // Bar track
    const barY = rowY + 18
    const barW = W - 48
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    drawRoundedRect(ctx, 24, barY, barW, 6, 3)
    ctx.fill()

    // Bar fill
    const fillW = Math.max(4, Math.min(barW, (barW * m.pct) / 100))
    ctx.fillStyle = m.color
    drawRoundedRect(ctx, 24, barY, fillW, 6, 3)
    ctx.fill()
  })

  // Tactical Stance & Footer
  const footerY = 720
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1
  drawRoundedRect(ctx, 24, footerY, W - 48, 38, 8)
  ctx.fill()
  ctx.stroke()

  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`Stance: ${options.stance.toUpperCase()}`, 36, footerY + 23)

  ctx.font = '10px monospace'
  ctx.fillStyle = '#475569'
  const brand = 'chaos-master.art • webmcp agent clash'
  const brandW = ctx.measureText(brand).width
  ctx.fillText(brand, W - 36 - brandW, footerY + 23)
}

export async function exportChampionCardPng(options: {
  readonly victor: ArenaFighterStats
  readonly rival: ArenaFighterStats | null
  readonly grounded: GroundedFlameStats
  readonly winStreak: number
  readonly stance: string
  readonly isWinner1: boolean
}): Promise<boolean> {
  try {
    const img = await getVictorImage(options.isWinner1)
    const offscreen = document.createElement('canvas')
    offscreen.width = 540
    offscreen.height = 780
    drawChampionCard(offscreen, {
      victor: options.victor,
      rival: options.rival,
      grounded: options.grounded,
      winStreak: options.winStreak,
      stance: options.stance,
      thumbnailImg: img,
    })

    const dataUrl = offscreen.toDataURL('image/png')
    const a = document.createElement('a')
    const safeName = (options.victor.name || 'champion')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
    a.download = `champion-${safeName}.png`
    a.href = dataUrl
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return true
  } catch {
    return false
  }
}
