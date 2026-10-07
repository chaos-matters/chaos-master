// A staged clash plays its rounds once and holds the last frame; no phantom fourth round.
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineProvider, useTimeline } from '@/contexts/TimelineContext'
import { createTestFlame } from '@/webmcp/testUtils'
import { ArenaOverlay } from './ArenaOverlay'
import type { ArenaOverlayProps } from './ArenaOverlay'
import type { ArenaFighterStats } from '@/commands/types'
import type { createTimelineState } from '@/utils/timeline'

type Timeline = ReturnType<typeof createTimelineState>

function mountArena() {
  const [p1, setP1] = createSignal<ArenaFighterStats | null>({
    name: 'Cosmic Phoenix',
    type: 'Solar Guardian',
    flame: createTestFlame(),
    powerLevel: 1450,
  })
  const [p2, setP2] = createSignal<ArenaFighterStats | null>({
    name: 'Void Marauder',
    type: 'Void Knight',
    flame: createTestFlame(),
    powerLevel: 1320,
  })
  const [commentary, setCommentary] = createSignal<string | null>(null)
  const [eventBanner, setEventBanner] = createSignal<string | null>(null)
  const [stance, setStance] = createSignal<string>('balanced')
  const [open, setOpen] = createSignal(true)
  const arena: ArenaOverlayProps['arena'] = {
    open,
    setOpen,
    player1Stats: p1,
    player2Stats: p2,
    setPlayer1Stats: setP1,
    setPlayer2Stats: setP2,
    commentary,
    setCommentary,
    eventBanner,
    setEventBanner,
    stance,
    setStance,
    selectFighter: vi.fn(),
  }
  let timeline: Timeline | undefined
  const Probe = () => {
    timeline = useTimeline() ?? undefined
    return null
  }
  const [mounted, setMounted] = createSignal(true)
  const result = render(() => (
    <TimelineProvider>
      <Probe />
      {mounted() && (
        <ArenaOverlay arena={arena} hardwareTier="high" onClose={vi.fn()} />
      )}
    </TimelineProvider>
  ))
  return {
    ...result,
    arena,
    timeline: timeline!,
    unmountArena: () => setMounted(false),
  }
}

describe('ArenaOverlay clash playback', () => {
  afterEach(() => {
    cleanup()
  })

  it('plays the staged rounds once and holds the last frame', () => {
    const { arena, timeline } = mountArena()
    timeline.setConfig({ ...timeline.config(), loop: true })

    void arena.startClash?.({ stance: 'balanced' })
    expect(timeline.isPlaying()).toBe(true)

    const { endFrame } = timeline.config()
    let lowest = Infinity
    // Step as the render loop does, only while playing, and well past the
    // end: a looping timeline wraps to round 1 and keeps going.
    for (let i = 0; i < endFrame + 30 && timeline.isPlaying(); i++) {
      timeline.advanceFrame()
      if (i > endFrame / 2) lowest = Math.min(lowest, timeline.currentFrame())
    }

    expect(lowest).toBeGreaterThan(endFrame / 2)
    expect(timeline.isPlaying()).toBe(false)
    expect(timeline.currentFrame()).toBe(endFrame)
  })

  it("gives the viewer's loop setting back when the arena closes", () => {
    const { arena, timeline, unmountArena } = mountArena()
    timeline.setConfig({ ...timeline.config(), loop: true, loopMode: 'cycle' })

    void arena.startClash?.({ stance: 'balanced' })
    expect(timeline.config().loop).toBe(false)
    unmountArena()

    expect(timeline.config().loop).toBe(true)
    expect(timeline.config().loopMode).toBe('cycle')
  })

  it("keeps the viewer's setting across a replay, not the clash's", () => {
    const { arena, timeline, unmountArena } = mountArena()
    timeline.setConfig({ ...timeline.config(), loop: true })

    void arena.startClash?.({ stance: 'balanced' })
    void arena.startClash?.({ stance: 'balanced' })
    expect(timeline.config().loop).toBe(false)
    unmountArena()

    expect(timeline.config().loop).toBe(true)
  })

  it("parks on the last frame when the viewer's timeline was already playing", () => {
    const { arena, timeline } = mountArena()
    timeline.play()

    void arena.startClash?.({ stance: 'balanced' })
    runToEnd(timeline)

    expect(timeline.isPlaying()).toBe(false)
    expect(timeline.currentFrame()).toBe(timeline.config().endFrame)
  })

  it('parks when a second clash starts while the first still plays', () => {
    const { arena, timeline } = mountArena()
    void arena.startClash?.({ stance: 'balanced' })
    timeline.advanceFrame()
    void arena.startClash?.({ stance: 'balanced' })
    runToEnd(timeline)

    expect(timeline.isPlaying()).toBe(false)
    expect(timeline.currentFrame()).toBe(timeline.config().endFrame)
  })

  it('Skip to Results holds the last frame, not the one it skipped from', () => {
    const { arena, timeline } = mountArena()
    void arena.startClash?.({ stance: 'balanced' })
    for (let i = 0; i < 10; i++) timeline.advanceFrame()

    screen.getByRole('button', { name: /Skip to Results/i }).click()

    expect(timeline.isPlaying()).toBe(false)
    expect(timeline.currentFrame()).toBe(timeline.config().endFrame)
  })
})

describe('ArenaOverlay with an agent-built fighter', () => {
  afterEach(() => {
    cleanup()
  })

  it('mounts for a player 1 flame with no render settings', () => {
    const { arena } = mountArena()
    const bare = createTestFlame() as unknown as Record<string, unknown>
    delete bare.renderSettings
    const stats = arena.player1Stats()!
    arena.setPlayer1Stats({
      ...stats,
      flame: bare as unknown as ArenaFighterStats['flame'],
    })
    expect(screen.getByRole('heading').textContent).toBe('Flame Clash Arena 3D')
  })
})

/** Step as the render loop does, while playing, and well past the end. */
function runToEnd(timeline: Timeline) {
  const { endFrame } = timeline.config()
  for (let i = 0; i < endFrame + 30 && timeline.isPlaying(); i++) {
    timeline.advanceFrame()
  }
}
