// Every clash the arena is asked for settles: with its result, or with why it was stopped.
import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineProvider } from '@/contexts/TimelineContext'
import { createTestFlame } from '@/webmcp/testUtils'
import { ArenaOverlay } from './ArenaOverlay'
import type { ArenaOverlayProps } from './ArenaOverlay'
import type { ArenaFighterStats } from '@/commands/types'

function mountArena(opts: { withOpponent?: boolean } = {}) {
  const fighter = (name: string): ArenaFighterStats => ({
    name,
    type: 'Fighter',
    flame: createTestFlame(),
    powerLevel: 1000,
  })
  const [p1, setP1] = createSignal<ArenaFighterStats | null>(fighter('One'))
  const [p2, setP2] = createSignal<ArenaFighterStats | null>(
    opts.withOpponent === false ? null : fighter('Two'),
  )
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
  const [mounted, setMounted] = createSignal(true)
  render(() => (
    <TimelineProvider>
      {mounted() && (
        <ArenaOverlay arena={arena} hardwareTier="high" onClose={vi.fn()} />
      )}
    </TimelineProvider>
  ))
  return { arena, setP2, unmount: () => setMounted(false) }
}

describe('arena.startClash', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('resolves with the result when the clash runs to its verdict', async () => {
    vi.useFakeTimers()
    const { arena } = mountArena()
    const done = arena.startClash!()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await done).toHaveProperty('winner')
  })

  it('settles as superseded when a second clash starts', async () => {
    vi.useFakeTimers()
    const { arena } = mountArena()
    const first = arena.startClash!()
    await vi.advanceTimersByTimeAsync(1_500)
    const second = arena.startClash!()

    expect(await first).toMatchObject({
      cancelled: true,
      reason: expect.stringMatching(/new clash/) as unknown,
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await second).toHaveProperty('winner')
  })

  it('settles as cancelled when the arena closes mid-clash', async () => {
    vi.useFakeTimers()
    const { arena, unmount } = mountArena()
    const done = arena.startClash!()
    await vi.advanceTimersByTimeAsync(1_500)
    unmount()

    expect(await done).toMatchObject({ cancelled: true })
  })

  it('settles at once when the clash cannot start', async () => {
    const { arena, setP2 } = mountArena()
    setP2(null)

    expect(await arena.startClash!()).toMatchObject({ cancelled: true })
  })
})
