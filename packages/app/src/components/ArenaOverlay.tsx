import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { calculateGroundedStats, getSchoolMultiplier } from '@/flame/stats'
import { Cross, Zap } from '@/icons'
import { DEFAULT_SEAT } from '@/seats/seatId'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import { animateClash } from '@/webmcp/tools/animateClash'
import { ARENA_ARCHETYPES, calculateEffectivePower, generateArchetypeOpponent, TACTICAL_STANCES, } from '@/webmcp/tools/arenaArchetypes'
import { simulateClash } from '@/webmcp/tools/simulateClash'
import ui from './ArenaOverlay.module.css'
import type { Component } from 'solid-js'
import type { ArenaFighterStats, CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { FlameSchool, GroundedFlameStats } from '@/flame/stats'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { TimelineTrack } from '@/utils/timeline'
import type { ArchetypeId, OpponentArchetype, TacticalStance, } from '@/webmcp/tools/arenaArchetypes'
import type { ClashRoundOutcome, SimulateClashResult, } from '@/webmcp/tools/simulateClash'

export interface ArenaOverlayProps {
  /** The overlay only mounts when the workspace actually has an arena, so it
   *  takes the concrete shape rather than the optional context member. */
  arena: NonNullable<CommandContext['arena']>
  hardwareTier?: HardwareTier | null
  onClose?: () => void
}

const PREVIEW_RES = { width: 380, height: 214 }

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

function getVictorImage(isWinner1: boolean): Promise<HTMLImageElement | null> {
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

function drawChampionCard(
  canvas: HTMLCanvasElement,
  options: {
    victor: ArenaFighterStats
    rival: ArenaFighterStats | null
    grounded: GroundedFlameStats
    winStreak: number
    stance: string
    thumbnailImg?: HTMLImageElement | null
  },
) {
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

function ensureCamera(flame?: FlameDescriptor): FlameDescriptor | null {
  if (!flame || !flame.transforms) return null
  const rs = flame.renderSettings ?? {}
  return {
    ...flame,
    renderSettings: {
      ...rs,
      camera: rs.camera ?? { zoom: 1, position: [0, 0], rotation: 0 },
      camera3D: rs.camera3D ?? {
        position: [0, 0, -5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 45,
      },
    },
  }
}

export const ArenaOverlay: Component<ArenaOverlayProps> = (props) => {
  const history = useChangeHistory()
  const timeline = useTimeline()

  // Game state
  const [gameState, setGameState] = createSignal<
    'idle' | 'clashing' | 'results'
  >('idle')
  const [localCommentary, setLocalCommentary] = createSignal<string | null>(
    'Prepare for 3D territorial combat. Choose a tactical stance and initiate the clash!',
  )
  const [winner, setWinner] = createSignal<1 | 2 | null>(null)
  const [rounds, setRounds] = createSignal<ClashRoundOutcome[]>([])
  const [activeRoundIndex, setActiveRoundIndex] = createSignal<number>(0)
  const [localEventBanner, setLocalEventBanner] = createSignal<string | null>(
    null,
  )
  const [winStreak, setWinStreak] = createSignal<number>(0)
  const [localStance, setLocalStance] = createSignal<TacticalStance>('balanced')
  const [opponentArchetype, setOpponentArchetype] =
    createSignal<OpponentArchetype>(ARENA_ARCHETYPES.chaos_lord)
  const [battleLog, setBattleLog] = createSignal<string[]>([])
  const [showBattleLog, setShowBattleLog] = createSignal<boolean>(false)
  const [exportingCard, setExportingCard] = createSignal<boolean>(false)

  // Reactive version counters & memos for fighter preview invalidation
  const [p1Version, setP1Version] = createSignal<number>(0)
  const [p2Version, setP2Version] = createSignal<number>(0)

  createEffect(() => {
    const f1 = props.arena.player1Stats()?.flame
    if (f1) setP1Version((v) => v + 1)
  })

  createEffect(() => {
    const f2 = props.arena.player2Stats()?.flame
    if (f2) setP2Version((v) => v + 1)
  })

  const p1PreviewFlame = createMemo(() =>
    ensureCamera(props.arena.player1Stats()?.flame),
  )
  const p2PreviewFlame = createMemo(() =>
    ensureCamera(props.arena.player2Stats()?.flame),
  )

  // Kinetic impact VFX signals for spectator mode
  const [isShaking, setIsShaking] = createSignal<boolean>(false)
  const [shockwaveActive, setShockwaveActive] = createSignal<boolean>(false)
  const [combatFloater, setCombatFloater] = createSignal<{
    text: string
    color: string
  } | null>(null)

  const commentary = () => props.arena.commentary?.() || localCommentary()
  const setCommentary = (val: string | null) => {
    setLocalCommentary(val)
    props.arena.setCommentary?.(val)
  }

  const eventBanner = () => props.arena.eventBanner?.() ?? localEventBanner()
  const setEventBanner = (val: string | null) => {
    setLocalEventBanner(val)
    props.arena.setEventBanner?.(val)
  }

  const stance = () =>
    (props.arena.stance?.() as TacticalStance) || localStance()
  const setStance = (val: TacticalStance) => {
    setLocalStance(val)
    props.arena.setStance?.(val)
  }

  const p1Grounded = createMemo<GroundedFlameStats | null>(() => {
    const p1 = props.arena.player1Stats()
    if (!p1?.flame) return null
    return p1.groundedStats ?? calculateGroundedStats(p1.flame)
  })

  const p2Grounded = createMemo<GroundedFlameStats | null>(() => {
    const p2 = props.arena.player2Stats()
    if (!p2?.flame) return null
    return p2.groundedStats ?? calculateGroundedStats(p2.flame)
  })

  const p1Advantage = createMemo(() => {
    const s1 = p1Grounded()?.school
    const s2 = p2Grounded()?.school
    if (!s1 || !s2) return 1.0
    return getSchoolMultiplier(s1, s2)
  })

  const p2Advantage = createMemo(() => {
    const s1 = p1Grounded()?.school
    const s2 = p2Grounded()?.school
    if (!s1 || !s2) return 1.0
    return getSchoolMultiplier(s2, s1)
  })

  const victorStats = createMemo(() => {
    const win = winner()
    if (win === 1) return props.arena.player1Stats()
    if (win === 2) return props.arena.player2Stats()
    return props.arena.player1Stats()
  })

  const victorGrounded = createMemo(() => {
    const win = winner()
    if (win === 1) return p1Grounded()
    if (win === 2) return p2Grounded()
    return p1Grounded()
  })

  const handleExportCard = async () => {
    const win = winner()
    if (!win) return
    setExportingCard(true)
    try {
      const p1 = props.arena.player1Stats()
      const p2 = props.arena.player2Stats()
      const victor = win === 1 ? p1 : p2
      const rival = win === 1 ? p2 : p1
      const victorGrounded = win === 1 ? p1Grounded() : p2Grounded()
      if (!victor || !victorGrounded) return

      const img = await getVictorImage(win === 1)
      const offscreen = document.createElement('canvas')
      offscreen.width = 540
      offscreen.height = 780
      drawChampionCard(offscreen, {
        victor,
        rival,
        grounded: victorGrounded,
        winStreak: winStreak(),
        stance: stance(),
        thumbnailImg: img,
      })

      const dataUrl = offscreen.toDataURL('image/png')
      const a = document.createElement('a')
      const safeName = (victor.name || 'champion')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
      a.download = `champion-${safeName}.png`
      a.href = dataUrl
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setCommentary(`Exported Champion Card for ${victor.name ?? 'Champion'}!`)
    } catch {
      // Non-fatal export error
    } finally {
      setExportingCard(false)
    }
  }

  let activeInterval: ReturnType<typeof setInterval> | null = null
  let activeTimeouts: ReturnType<typeof setTimeout>[] = []
  let initialFlame: FlameDescriptor | null = null
  let initialTracks: TimelineTrack[] | null = null
  let initialDuration: number | null = null
  let initialAnimationEnabled: boolean | null = null
  let wasClashStaged = false
  const [cachedSimResult, setCachedSimResult] =
    createSignal<SimulateClashResult | null>(null)

  const registerTimeout = (
    fn: () => void,
    ms: number,
  ): ReturnType<typeof setTimeout> => {
    const id = setTimeout(() => {
      activeTimeouts = activeTimeouts.filter((t) => t !== id)
      fn()
    }, ms)
    activeTimeouts.push(id)
    return id
  }

  const clearAllTimers = () => {
    if (activeInterval !== null) {
      clearInterval(activeInterval)
      activeInterval = null
    }
    for (const id of activeTimeouts) {
      clearTimeout(id)
    }
    activeTimeouts = []
  }

  // Pinned to the player throughout: the target follows a duel to the rival
  // seat, and restoring through it would write the agent's flame into the
  // viewer's document.
  const captureWorkspace = () => {
    const ctx = getWebMcpContext(DEFAULT_SEAT)
    if (!wasClashStaged && ctx && timeline) {
      initialFlame = deepClone(ctx.flameDescriptor())
      initialTracks = deepClone(timeline.tracks())
      initialDuration =
        timeline.config().endFrame - timeline.config().startFrame
      initialAnimationEnabled = ctx.timeline.animationEnabled()
    }
  }

  const restoreWorkspace = () => {
    if (wasClashStaged && initialFlame) {
      if (timeline) {
        timeline.pause()
      }
      history.replaceSilently(initialFlame)
      if (initialTracks && timeline) {
        timeline.loadTracks(initialTracks)
      }
      const ctx = getWebMcpContext(DEFAULT_SEAT)
      if (initialDuration !== null && ctx) {
        ctx.timeline.setDuration(initialDuration)
      }
      if (initialAnimationEnabled !== null && ctx) {
        ctx.timeline.setAnimationEnabled(initialAnimationEnabled)
      }
      if (timeline) {
        timeline.setCurrentFrame(0)
      }
      wasClashStaged = false
    }
  }

  // Reroll opponent to a fresh procedural archetype
  const handleRerollOpponent = (specificArchetype?: ArchetypeId) => {
    const p1 = props.arena.player1Stats()
    const base = p1?.flame ?? initialFlame
    if (!base) return

    clearAllTimers()
    restoreWorkspace()
    setGameState('idle')
    setWinner(null)
    setRounds([])
    setBattleLog([])
    setCachedSimResult(null)
    setEventBanner(null)
    setCommentary(
      'A new challenger enters the arena! Inspect their traits and prepare for battle.',
    )

    const newOpponent = generateArchetypeOpponent(base, specificArchetype)
    setOpponentArchetype(newOpponent.archetype)

    if (props.arena.setPlayer2Stats) {
      props.arena.setPlayer2Stats({
        name: newOpponent.name,
        type: newOpponent.className,
        school: newOpponent.school,
        powerLevel: newOpponent.powerLevel,
        flame: newOpponent.flame,
        groundedStats: newOpponent.groundedStats,
        metrics: newOpponent.metrics,
      })
    }
  }

  onMount(() => {
    // Register programmatic clash runner and gameState
    props.arena.gameState = gameState
    props.arena.startClash = (opts) => {
      if (opts?.stance) {
        setStance(opts.stance as TacticalStance)
      }
      return new Promise((resolve) => {
        runSimulation((res) => {
          resolve(res)
        })
      })
    }

    // If P2 is not set, generate an archetype opponent
    const p2 = props.arena.player2Stats()
    if (!p2 || !p2.flame) {
      handleRerollOpponent()
    }
  })

  onCleanup(() => {
    clearAllTimers()
    restoreWorkspace()
  })

  const handleClose = () => {
    clearAllTimers()
    restoreWorkspace()
    props.arena.setOpen(false)
    props.onClose?.()
  }

  const runSimulation = (
    onComplete?: (simRes: SimulateClashResult) => void,
  ) => {
    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    if (!p1 || !p2 || !p1.flame || !p2.flame) return

    clearAllTimers()
    captureWorkspace()

    setGameState('clashing')
    setWinner(null)
    setEventBanner(null)
    setCommentary(
      'Fighters engaging in shared arena volume... Calculating trajectory and impact dynamics!',
    )

    const flameDimensions = (p1.flame.renderSettings?.dimensions as 2 | 3) ?? 3

    const simRes = simulateClash.execute(
      {
        flameA: p1.flame,
        flameB: p2.flame,
        dimensions: flameDimensions,
        rounds: 3,
        stanceA: stance(),
        stanceB: 'balanced',
      },
      {},
    ) as SimulateClashResult

    if (!simRes || !simRes.rounds) {
      setGameState('idle')
      return
    }

    setCachedSimResult(simRes)
    setRounds(simRes.rounds)
    setActiveRoundIndex(0)

    // Stage flame & keyframe 2D/3D kinetic combat tracks across 90 frames (30 per round)
    animateClash.execute(
      {
        simulation: simRes,
        flameA: p1.flame,
        flameB: p2.flame,
        framesPerRound: 30,
      },
      {},
    )
    wasClashStaged = true

    // Start timeline playback
    if (timeline) {
      timeline.setCurrentFrame(0)
      timeline.play()
    }

    // Step through rounds with impact VFX sync
    let currentIdx = 0
    activeInterval = setInterval(() => {
      if (currentIdx < simRes.rounds.length) {
        const r = simRes.rounds[currentIdx]!
        setActiveRoundIndex(currentIdx)
        if (r.event) {
          setEventBanner(r.event)
        }

        const winnerName =
          r.winner === 'A'
            ? (p1.name ?? 'Player 1')
            : r.winner === 'B'
              ? (p2.name ?? 'Player 2')
              : 'Contested'
        setCommentary(
          `Round ${r.round}: ${winnerName} takes territory (${Math.round(r.ownershipA * 100)}% vs ${Math.round(r.ownershipB * 100)}%)${r.event ? ` — [${r.event}]` : ''}`,
        )

        // Trigger visual impact flash, screen shake, and floating text at mid-round collision
        registerTimeout(() => {
          if (gameState() !== 'clashing') return
          setIsShaking(true)
          registerTimeout(() => setIsShaking(false), 300)
          setShockwaveActive(true)
          registerTimeout(() => setShockwaveActive(false), 600)
          const isWinnerP1 = r.winner === 'A'
          const floaterText = r.event
            ? `CRITICAL [${r.event}]!`
            : isWinnerP1
              ? '+150 TERRITORY'
              : r.winner === 'B'
                ? '-150 TERRITORY'
                : 'CLASH DEADLOCK'
          const floaterColor = isWinnerP1
            ? '#22d3ee'
            : r.winner === 'B'
              ? '#fb923c'
              : '#fbbf24'
          setCombatFloater({ text: floaterText, color: floaterColor })
          registerTimeout(() => setCombatFloater(null), 850)
        }, 350)

        currentIdx++
      } else {
        finishSimulation(simRes)
        onComplete?.(simRes)
      }
    }, 1000)
  }

  const finishSimulation = (simRes: SimulateClashResult) => {
    clearAllTimers()
    if (timeline) {
      timeline.pause()
    }

    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    const finalWin =
      simRes.winner === 'A' ? 1 : simRes.winner === 'B' ? 2 : null

    setWinner(finalWin)
    setGameState('results')
    if (simRes.battleLog) {
      setBattleLog(simRes.battleLog)
    }

    if (finalWin === 1) {
      const nextStreak = winStreak() + 1
      setWinStreak(nextStreak)
      setCommentary(
        `${p1?.name ?? 'Player 1'} secures decisive victory (${simRes.finalScore.A} - ${simRes.finalScore.B})! Current Streak: ${nextStreak} ${nextStreak === 1 ? 'Win' : 'Wins'}.`,
      )
    } else if (finalWin === 2) {
      setWinStreak(0)
      setCommentary(
        `${p2?.name ?? 'Player 2'} claims the territory (${simRes.finalScore.A} - ${simRes.finalScore.B}). Streak reset.`,
      )
    } else {
      setCommentary(
        `The clash ends in a deadlock! Neither flame could establish total dominance (${simRes.finalScore.A} - ${simRes.finalScore.B}).`,
      )
    }
  }

  // Fast forward directly to results
  const handleSkipClash = () => {
    const simRes = cachedSimResult()
    if (gameState() !== 'clashing' || !simRes) return
    setActiveRoundIndex(simRes.rounds.length - 1)
    finishSimulation(simRes)
  }

  const handleClash = () => {
    runSimulation()
  }

  const loadFighter = (player: 1 | 2) => {
    clearAllTimers()
    wasClashStaged = false
    if (props.arena.selectFighter) {
      props.arena.selectFighter(player)
      props.arena.setOpen(false)
      props.onClose?.()
    }
  }

  // Keyboard shortcut handler
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (gameState() === 'idle' || gameState() === 'results') {
          handleClash()
        } else if (gameState() === 'clashing') {
          handleSkipClash()
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (gameState() === 'idle' || gameState() === 'results') {
          e.preventDefault()
          handleRerollOpponent()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown)
    })
  })

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div
        class={ui.modal}
        classList={{ [ui.isClashing!]: gameState() === 'clashing' }}
        data-testid="flame-clash-arena-modal"
      >
        {/* Top Bar HUD Strip */}
        <div class={ui.topBarStrip}>
          <div class={ui.topBarLeft}>
            <div class={ui.pulseDot} />
            <h2 class={ui.title}>Flame Clash Arena 3D</h2>
            <Show when={winStreak() > 0}>
              <div class={ui.streakBadge} title="Current Arena Win Streak">
                <span class={ui.streakFire}>★</span>
                <span>
                  Streak: {winStreak()} {winStreak() === 1 ? 'Win' : 'Wins'}
                </span>
              </div>
            </Show>
          </div>

          <div class={ui.topBarCenter}>
            <div class={ui.topRoundRow}>
              <span class={ui.topRoundPill}>
                {gameState() === 'clashing'
                  ? `ROUND ${rounds()[activeRoundIndex()]?.round ?? activeRoundIndex() + 1} / 3`
                  : gameState() === 'results'
                    ? winner() === 1
                      ? 'VICTORY: PLAYER 1'
                      : winner() === 2
                        ? 'VICTORY: OPPONENT'
                        : 'MATCH DRAW'
                    : 'READY TO CLASH'}
              </span>
              <div class={ui.territoryMiniTrack}>
                <div
                  class={ui.territoryMiniA}
                  style={{
                    width: `${Math.round(
                      (rounds()[activeRoundIndex()]?.ownershipA ?? 0.5) * 100,
                    )}%`,
                  }}
                  title={`P1 Territory: ${Math.round(
                    (rounds()[activeRoundIndex()]?.ownershipA ?? 0.5) * 100,
                  )}%`}
                />
                <div
                  class={ui.territoryMiniContested}
                  style={{
                    width: `${Math.round(
                      (rounds()[activeRoundIndex()]?.contested ?? 0) * 100,
                    )}%`,
                  }}
                  title="Contested"
                />
                <div
                  class={ui.territoryMiniB}
                  style={{
                    width: `${Math.round(
                      (rounds()[activeRoundIndex()]?.ownershipB ?? 0.5) * 100,
                    )}%`,
                  }}
                  title={`P2 Territory: ${Math.round(
                    (rounds()[activeRoundIndex()]?.ownershipB ?? 0.5) * 100,
                  )}%`}
                />
              </div>
            </div>

            <div class={ui.topCommentaryBox}>
              {commentary() ??
                'Choose a tactical stance and initiate the clash!'}
              <Show when={eventBanner()}>
                {(evt) => <span class={ui.eventBanner}>{evt()}</span>}
              </Show>
            </div>
          </div>

          <div class={ui.topBarRight}>
            <div class={ui.topStanceGroup}>
              <For each={Object.values(TACTICAL_STANCES)}>
                {(s) => (
                  <button
                    class={ui.topStanceChip}
                    classList={{
                      [ui.topStanceChipActive!]: stance() === s.id,
                    }}
                    onClick={() => {
                      setStance(s.id)
                    }}
                    disabled={gameState() === 'clashing'}
                    title={`${s.name}: ${s.description}`}
                  >
                    {s.name}
                  </button>
                )}
              </For>
            </div>

            <Show when={rounds().length > 0 && gameState() === 'results'}>
              <button
                class={ui.replayBtn}
                onClick={() => {
                  runSimulation()
                }}
                title="Replay Battle"
              >
                Replay
              </button>
            </Show>
            <button
              class={ui.closeButton}
              onClick={handleClose}
              aria-label="Exit Arena"
              title="Exit Arena (Esc)"
            >
              <Cross width="1rem" />
            </button>
          </div>
        </div>

        {/* Body / Battlefield Area */}
        <div class={ui.body}>
          <div class={ui.battlefield}>
            {/* Player 1 (Left / Cyan) */}
            <Show when={props.arena.player1Stats()}>
              {(p1) => {
                const curStance = () =>
                  TACTICAL_STANCES[stance()] ?? TACTICAL_STANCES.balanced
                const effPower = () =>
                  calculateEffectivePower(p1().powerLevel || 0, stance())

                return (
                  <div
                    class={`${ui.fighterCard} ${ui.p1Card}`}
                    classList={{ [ui.p1CardWinner!]: winner() === 1 }}
                  >
                    <div class={ui.fighterPreview}>
                      <Show
                        when={p1PreviewFlame()}
                        fallback={
                          <div class={ui.fighterPreviewInner}>
                            <span class={ui.fighterLabel}>
                              {p1().name ?? 'Player 1'}
                            </span>
                          </div>
                        }
                      >
                        {(f) => (
                          <div class={ui.previewLayer}>
                            <VariationPreview
                              version={p1Version()}
                              isSelected={winner() === 1}
                              flame={f()}
                              name={p1().name ?? 'Player 1'}
                              resolution={PREVIEW_RES}
                              hardwareTier={props.hardwareTier}
                              snapshotOnly
                            />
                          </div>
                        )}
                      </Show>

                      <Show when={winner() === 1}>
                        <div class={ui.victorBadge}>VICTOR</div>
                      </Show>
                    </div>

                    <div class={ui.fighterHeader}>
                      <div>
                        <div class={ui.fighterTitleRow}>
                          <div class={`${ui.fighterName} ${ui.p1Name}`}>
                            {p1().name ?? 'Player 1'}
                          </div>
                          <Show when={p1Grounded()?.school}>
                            {(sch) => (
                              <span
                                class={ui.schoolBadge}
                                style={{
                                  'background-color': SCHOOL_COLORS[sch()].bg,
                                  color: SCHOOL_COLORS[sch()].text,
                                  'border-color': SCHOOL_COLORS[sch()].border,
                                }}
                              >
                                {sch()}
                              </span>
                            )}
                          </Show>
                          <Show when={p1Advantage() > 1.0}>
                            <span class={ui.advantageBadge}>
                              +{Math.round((p1Advantage() - 1) * 100)}%
                            </span>
                          </Show>
                        </div>
                        <div class={ui.fighterClass}>
                          Class: {p1().type || 'Fractal Guardian'}
                        </div>
                      </div>
                      <Show when={p1().flame}>
                        <button
                          class={ui.loadBtn}
                          onClick={() => {
                            loadFighter(1)
                          }}
                          title="Load this flame into main workspace"
                        >
                          Load
                        </button>
                      </Show>
                    </div>

                    <div class={ui.statList}>
                      <StatRow
                        label="Power"
                        value={effPower()}
                        max={2000}
                        color="#22d3ee"
                      />
                      <StatRow
                        label="Complexity"
                        value={
                          (p1().metrics?.complexity || 0) *
                          10 *
                          curStance().effects.complexityMultiplier
                        }
                        max={100}
                        color="#60a5fa"
                      />
                      <StatRow
                        label="Chaos"
                        value={
                          (p1().metrics?.chaosLevel || 0) *
                          10 *
                          curStance().effects.chaosMultiplier
                        }
                        max={100}
                        color="#c084fc"
                      />
                      <StatRow
                        label="Symmetry"
                        value={
                          (p1().metrics?.symmetryScore || 0) *
                          10 *
                          curStance().effects.symmetryMultiplier
                        }
                        max={100}
                        color="#818cf8"
                      />
                      <StatRow
                        label="Energy"
                        value={
                          (p1().metrics?.energyIntensity || 0) *
                          10 *
                          curStance().effects.energyMultiplier
                        }
                        max={100}
                        color="#2dd4bf"
                      />
                    </div>

                    <Show when={p1Grounded()}>
                      {(g) => (
                        <div class={ui.groundedMetrics}>
                          <div
                            class={ui.groundedMetricItem}
                            title="Moran similarity dimension"
                          >
                            <span class={ui.groundedMetricKey}>Dim</span>
                            <span class={ui.groundedMetricVal}>
                              {g().dimension.toFixed(2)}
                            </span>
                          </div>
                          <div
                            class={ui.groundedMetricItem}
                            title="Spectral stability / contractivity"
                          >
                            <span class={ui.groundedMetricKey}>Stab</span>
                            <span class={ui.groundedMetricVal}>
                              {Math.round(g().stability * 100)}%
                            </span>
                          </div>
                          <div
                            class={ui.groundedMetricItem}
                            title="Shannon entropy of transform weights"
                          >
                            <span class={ui.groundedMetricKey}>Ent</span>
                            <span class={ui.groundedMetricVal}>
                              {g().entropy.toFixed(2)}
                            </span>
                          </div>
                          <div
                            class={ui.groundedMetricItem}
                            title="Rotational symmetry order"
                          >
                            <span class={ui.groundedMetricKey}>Sym</span>
                            <span class={ui.groundedMetricVal}>
                              C{g().symmetryOrder}
                            </span>
                          </div>
                        </div>
                      )}
                    </Show>

                    {/* Tactical Stance Selector */}
                    <div class={ui.stanceContainer}>
                      <div class={ui.stanceTitle}>Tactical Stance</div>
                      <div class={ui.stanceGrid}>
                        <For each={Object.values(TACTICAL_STANCES)}>
                          {(s) => (
                            <button
                              class={ui.stanceBtn}
                              classList={{
                                [ui.stanceBtnActive!]: stance() === s.id,
                              }}
                              onClick={() => {
                                setStance(s.id)
                              }}
                              disabled={gameState() === 'clashing'}
                              title={s.description}
                            >
                              <span class={ui.stanceName}>{s.name}</span>
                              <span class={ui.stanceTagline}>{s.tagline}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                )
              }}
            </Show>

            {/* Center Column: Idle, Clashing & Immediate Winner Trophy Card */}
            <div class={ui.centerColumn}>
              <Show when={gameState() === 'idle'}>
                <div class={ui.vsCenter}>
                  <div class={ui.vsText}>VS</div>
                  <button
                    class={ui.clashBtn}
                    onClick={handleClash}
                    title="Engage battle (Space)"
                  >
                    <Zap width="1.2rem" height="1.2rem" />
                    <span>CLASH</span>
                    <Zap width="1.2rem" height="1.2rem" />
                  </button>
                  <div class={ui.keyboardHints}>Press [Space] to Clash</div>
                </div>
              </Show>

              <Show when={gameState() === 'clashing'}>
                <div class={ui.clashActiveArea}>
                  <div
                    class={ui.clashStage}
                    classList={{ [ui.shakeEffect!]: isShaking() }}
                  >
                    <Show when={shockwaveActive()}>
                      <div class={ui.shockwaveRing} />
                    </Show>
                    <Show when={combatFloater()}>
                      {(floater) => (
                        <div
                          class={ui.combatFloater}
                          style={{ color: floater().color }}
                        >
                          {floater().text}
                        </div>
                      )}
                    </Show>
                  </div>
                  <div class={ui.clashBottomBar}>
                    <button
                      class={ui.skipBtn}
                      onClick={handleSkipClash}
                      title="Skip animation to results"
                    >
                      Skip to Results
                    </button>
                  </div>
                </div>
              </Show>

              <Show when={gameState() === 'results'}>
                <div class={ui.centerWinnerContainer}>
                  <div class={ui.winnerTrophyCard}>
                    <div class={ui.winnerTrophyHeader}>
                      <span class={ui.winnerTrophyTitle}>
                        Chaos Master • Arena Champion
                      </span>
                      <Show when={winStreak() > 0}>
                        <div
                          class={ui.streakBadge}
                          title="Current Arena Win Streak"
                        >
                          <span class={ui.streakFire}>★</span>
                          <span>
                            Streak: {winStreak()}{' '}
                            {winStreak() === 1 ? 'Win' : 'Wins'}
                          </span>
                        </div>
                      </Show>
                    </div>

                    <div class={ui.winnerArtContainer}>
                      <Show
                        when={
                          winner() === 2 ? p2PreviewFlame() : p1PreviewFlame()
                        }
                        fallback={
                          <div class={ui.fighterPreviewInner}>
                            <span class={ui.fighterLabel}>
                              {victorStats()?.name ?? 'Champion'}
                            </span>
                          </div>
                        }
                      >
                        {(f) => (
                          <div class={ui.previewLayer}>
                            <VariationPreview
                              version={
                                winner() === 2 ? p2Version() : p1Version()
                              }
                              isSelected={true}
                              flame={f()}
                              name={victorStats()?.name ?? 'Champion'}
                              resolution={PREVIEW_RES}
                              hardwareTier={props.hardwareTier}
                              snapshotOnly
                            />
                          </div>
                        )}
                      </Show>
                      <div class={ui.winnerCrownBadge}>
                        {winner() !== null ? 'VICTOR' : 'DRAW'}
                      </div>
                      <Show when={victorGrounded()?.school}>
                        {(sch) => (
                          <span
                            class={`${ui.schoolBadge} ${ui.winnerSchoolBadgeOverlay}`}
                            style={{
                              'background-color': SCHOOL_COLORS[sch()].bg,
                              color: SCHOOL_COLORS[sch()].text,
                              'border-color': SCHOOL_COLORS[sch()].border,
                            }}
                          >
                            {sch()}
                          </span>
                        )}
                      </Show>
                    </div>

                    <div class={ui.winnerInfoRow}>
                      <div>
                        <div
                          class={ui.winnerBigName}
                          style={{
                            color:
                              winner() === 1
                                ? '#22d3ee'
                                : winner() === 2
                                  ? '#fb923c'
                                  : '#fbbf24',
                          }}
                        >
                          {victorStats()?.name ?? 'Arena Champion'}
                        </div>
                        <div class={ui.fighterClass}>
                          Class: {victorStats()?.type ?? 'Fractal Guardian'}
                        </div>
                      </div>
                      <div class={ui.winnerPowerBadge}>
                        PWR{' '}
                        {victorGrounded()?.powerLevel ??
                          victorStats()?.powerLevel ??
                          1000}
                      </div>
                    </div>

                    <Show when={cachedSimResult()}>
                      {(sim) => (
                        <div class={ui.winnerScoreBanner}>
                          <span>Territory Dominance</span>
                          <span class={ui.winnerFinalScore}>
                            {sim().finalScore.A} - {sim().finalScore.B}
                          </span>
                        </div>
                      )}
                    </Show>

                    <Show when={victorGrounded()}>
                      {(g) => (
                        <div class={ui.groundedMetrics}>
                          <div
                            class={ui.groundedMetricItem}
                            title="Moran similarity dimension"
                          >
                            <span class={ui.groundedMetricKey}>Dim</span>
                            <span class={ui.groundedMetricVal}>
                              {g().dimension.toFixed(2)}
                            </span>
                          </div>
                          <div
                            class={ui.groundedMetricItem}
                            title="Spectral stability / contractivity"
                          >
                            <span class={ui.groundedMetricKey}>Stab</span>
                            <span class={ui.groundedMetricVal}>
                              {Math.round(g().stability * 100)}%
                            </span>
                          </div>
                          <div
                            class={ui.groundedMetricItem}
                            title="Shannon entropy of transform weights"
                          >
                            <span class={ui.groundedMetricKey}>Ent</span>
                            <span class={ui.groundedMetricVal}>
                              {g().entropy.toFixed(2)}
                            </span>
                          </div>
                          <div
                            class={ui.groundedMetricItem}
                            title="Rotational symmetry order"
                          >
                            <span class={ui.groundedMetricKey}>Sym</span>
                            <span class={ui.groundedMetricVal}>
                              C{g().symmetryOrder}
                            </span>
                          </div>
                        </div>
                      )}
                    </Show>

                    <div class={ui.centerActionsBar}>
                      <button
                        class={ui.centerNextBtn}
                        onClick={() => {
                          handleRerollOpponent()
                        }}
                        title="Face next procedural opponent (R)"
                      >
                        <Zap width="1.1rem" height="1.1rem" />
                        <span>Next Challenger</span>
                        <Zap width="1.1rem" height="1.1rem" />
                      </button>
                      <div class={ui.centerSubActions}>
                        <button
                          class={ui.centerReplayBtn}
                          onClick={() => {
                            runSimulation()
                          }}
                          title="Replay Clash (Space)"
                        >
                          Replay Clash
                        </button>
                        <Show when={winner() !== null}>
                          <button
                            class={ui.centerLoadBtn}
                            onClick={() => {
                              loadFighter(winner()!)
                            }}
                            title="Load Victor to Canvas"
                          >
                            Load Victor
                          </button>
                        </Show>
                      </div>
                      <button
                        class={ui.centerExportBtn}
                        onClick={handleExportCard}
                        disabled={exportingCard()}
                        title="Export collectible Champion Card as PNG"
                      >
                        <span>
                          {exportingCard()
                            ? 'Exporting...'
                            : 'Download Card (PNG)'}
                        </span>
                      </button>
                      <div class={ui.keyboardHints}>
                        [Space] Replay • [R] Next Challenger • [Esc] Exit
                      </div>
                    </div>
                  </div>
                </div>
              </Show>
            </div>

            {/* Player 2 (Right / Orange/Red) */}
            <Show when={props.arena.player2Stats()}>
              {(p2) => (
                <div
                  class={`${ui.fighterCard} ${ui.p2Card}`}
                  classList={{ [ui.p2CardWinner!]: winner() === 2 }}
                >
                  <div class={ui.fighterPreview}>
                    <Show
                      when={p2PreviewFlame()}
                      fallback={
                        <div class={ui.fighterPreviewInner}>
                          <span class={ui.fighterLabel}>
                            {p2().name ?? 'Player 2'}
                          </span>
                        </div>
                      }
                    >
                      {(f) => (
                        <div class={ui.previewLayer}>
                          <VariationPreview
                            version={p2Version()}
                            isSelected={winner() === 2}
                            flame={f()}
                            name={p2().name ?? 'Player 2'}
                            resolution={PREVIEW_RES}
                            hardwareTier={props.hardwareTier}
                            snapshotOnly
                          />
                        </div>
                      )}
                    </Show>

                    <Show when={winner() === 2}>
                      <div class={ui.victorBadge}>VICTOR</div>
                    </Show>
                  </div>

                  <div class={ui.fighterHeader}>
                    <div>
                      <div class={ui.fighterTitleRow}>
                        <div class={`${ui.fighterName} ${ui.p2Name}`}>
                          {p2().name ?? 'Player 2'}
                        </div>
                        <Show when={p2Grounded()?.school}>
                          {(sch) => (
                            <span
                              class={ui.schoolBadge}
                              style={{
                                'background-color': SCHOOL_COLORS[sch()].bg,
                                color: SCHOOL_COLORS[sch()].text,
                                'border-color': SCHOOL_COLORS[sch()].border,
                              }}
                            >
                              {sch()}
                            </span>
                          )}
                        </Show>
                        <Show when={p2Advantage() > 1.0}>
                          <span class={ui.advantageBadge}>
                            +{Math.round((p2Advantage() - 1) * 100)}%
                          </span>
                        </Show>
                      </div>
                      <div class={ui.fighterClass}>
                        Archetype: {p2().type || opponentArchetype().className}
                      </div>
                    </div>
                    <Show when={p2().flame}>
                      <button
                        class={ui.loadBtn}
                        onClick={() => {
                          loadFighter(2)
                        }}
                        title="Load this flame into main workspace"
                      >
                        Load
                      </button>
                    </Show>
                  </div>

                  <div class={ui.statList}>
                    <StatRow
                      label="Power"
                      value={p2().powerLevel || 0}
                      max={2000}
                      color="#fb923c"
                    />
                    <StatRow
                      label="Complexity"
                      value={(p2().metrics?.complexity || 0) * 10}
                      max={100}
                      color="#f87171"
                    />
                    <StatRow
                      label="Chaos"
                      value={(p2().metrics?.chaosLevel || 0) * 10}
                      max={100}
                      color="#f472b6"
                    />
                    <StatRow
                      label="Symmetry"
                      value={(p2().metrics?.symmetryScore || 0) * 10}
                      max={100}
                      color="#facc15"
                    />
                    <StatRow
                      label="Energy"
                      value={(p2().metrics?.energyIntensity || 0) * 10}
                      max={100}
                      color="#fbbf24"
                    />
                  </div>

                  <Show when={p2Grounded()}>
                    {(g) => (
                      <div class={ui.groundedMetrics}>
                        <div
                          class={ui.groundedMetricItem}
                          title="Moran similarity dimension"
                        >
                          <span class={ui.groundedMetricKey}>Dim</span>
                          <span class={ui.groundedMetricVal}>
                            {g().dimension.toFixed(2)}
                          </span>
                        </div>
                        <div
                          class={ui.groundedMetricItem}
                          title="Spectral stability / contractivity"
                        >
                          <span class={ui.groundedMetricKey}>Stab</span>
                          <span class={ui.groundedMetricVal}>
                            {Math.round(g().stability * 100)}%
                          </span>
                        </div>
                        <div
                          class={ui.groundedMetricItem}
                          title="Shannon entropy of transform weights"
                        >
                          <span class={ui.groundedMetricKey}>Ent</span>
                          <span class={ui.groundedMetricVal}>
                            {g().entropy.toFixed(2)}
                          </span>
                        </div>
                        <div
                          class={ui.groundedMetricItem}
                          title="Rotational symmetry order"
                        >
                          <span class={ui.groundedMetricKey}>Sym</span>
                          <span class={ui.groundedMetricVal}>
                            C{g().symmetryOrder}
                          </span>
                        </div>
                      </div>
                    )}
                  </Show>

                  {/* Opponent Lore & Actions */}
                  <div class={ui.opponentLoreBox}>
                    {opponentArchetype().lore}
                  </div>

                  <div class={ui.cardFooterActions}>
                    <button
                      class={ui.rerollBtn}
                      onClick={() => {
                        handleRerollOpponent()
                      }}
                      disabled={gameState() === 'clashing'}
                      title="Generate new opponent archetype (R)"
                    >
                      <span>Reroll Opponent</span>
                    </button>
                  </div>
                </div>
              )}
            </Show>
          </div>

          {/* Tactical Battle Log */}
          <Show when={gameState() === 'results' && battleLog().length > 0}>
            <div class={ui.battleLogSection}>
              <div
                class={ui.battleLogHeader}
                onClick={() => setShowBattleLog(!showBattleLog())}
              >
                <span class={ui.battleLogTitle}>
                  Tactical Battle Log ({battleLog().length} events)
                </span>
                <span class={ui.battleLogToggle}>
                  {showBattleLog() ? '[Hide]' : '[Show]'}
                </span>
              </div>
              <Show when={showBattleLog()}>
                <div class={ui.battleLogList}>
                  <For each={battleLog()}>
                    {(logItem) => <div class={ui.battleLogItem}>{logItem}</div>}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </ComputeGate>
  )
}

function StatRow(props: {
  label: string
  value: number
  max: number
  color: string
}) {
  const percentage = () =>
    Math.min(100, Math.max(0, (props.value / props.max) * 100))

  return (
    <div class={ui.statRow}>
      <div class={ui.statLabels}>
        <span>{props.label}</span>
        <span>{Math.round(props.value)}</span>
      </div>
      <div class={ui.statTrack}>
        <div
          class={ui.statFill}
          style={{
            width: `${percentage()}%`,
            background: props.color,
          }}
        />
      </div>
    </div>
  )
}
