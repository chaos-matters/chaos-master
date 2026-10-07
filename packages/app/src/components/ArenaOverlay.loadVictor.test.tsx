/**
 * Load Victor after a clash: the clash staged its own flame, camera and
 * exposure tracks, duration and animation flag into the workspace. Loading a
 * fighter gives the user's workspace back first and then loads the fighter
 * over it, so the clash choreography does not keep playing on the victor and
 * the user's own keyframes come back.
 */
import '@/commands/builtins'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangeHistoryContextProvider } from '@/contexts/ChangeHistoryContext'
import { TimelineProvider, useTimeline } from '@/contexts/TimelineContext'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { ArenaOverlay } from './ArenaOverlay'
import type { ArenaOverlayProps } from './ArenaOverlay'
import type { ArenaFighterStats } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'
import type { createTimelineState, TimelineTrack } from '@/utils/timeline'

type Timeline = ReturnType<typeof createTimelineState>

const USER_TRACKS: TimelineTrack[] = [
  {
    parameterPath: 'renderSettings.exposure',
    keyframes: [
      { frame: 0, value: 0.2 },
      { frame: 40, value: 0.6 },
    ],
  },
]

function mountWorkspace() {
  // Two different flames: two copies of one flame fight to a draw, and a
  // draw has no victor to load.
  const fighter = (
    name: string,
    flame: FlameDescriptor,
  ): ArenaFighterStats => ({
    name,
    type: 'Solar Guardian',
    flame: deepClone(flame),
    powerLevel: 1400,
  })
  const [p1, setP1] = createSignal<ArenaFighterStats | null>(
    fighter('Cosmic Phoenix', examples.example1),
  )
  const [p2, setP2] = createSignal<ArenaFighterStats | null>(
    fighter('Void Marauder', createTestFlame()),
  )
  const [commentary, setCommentary] = createSignal<string | null>(null)
  const [eventBanner, setEventBanner] = createSignal<string | null>(null)
  const [stance, setStance] = createSignal<string>('balanced')
  const [open, setOpen] = createSignal(true)

  // The user's workspace, as the arena's own seat context sees it.
  let timeline: Timeline | undefined
  const userFlame = createTestFlame()
  userFlame.metadata = { ...userFlame.metadata, name: 'My Flame' }
  const ctx = createMockCommandContext()
  ctx.flameDescriptor = () => userFlame
  const setDuration = vi.fn()
  const setAnimationEnabled = vi.fn()
  ctx.timeline = {
    ...ctx.timeline,
    // No edit seam: the clash writes its tracks through setTracks, here
    // into the same timeline the overlay restores.
    edit: undefined,
    tracks: () => timeline!.tracks(),
    setTracks: (tracks: TimelineTrack[]) => {
      timeline!.loadTracks(tracks)
    },
    animationEnabled: () => false,
    setAnimationEnabled,
    setDuration,
  } as unknown as typeof ctx.timeline
  setWebMcpContext(ctx)

  const replaceSilently = vi.fn()
  const history = {
    replaceSilently,
  } as unknown as ChangeHistory<FlameDescriptor>
  const selectFighter = vi.fn()
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
    selectFighter,
  }
  const Probe = () => {
    timeline = useTimeline() ?? undefined
    return null
  }
  render(() => (
    <ChangeHistoryContextProvider value={history}>
      <TimelineProvider>
        <Probe />
        <ArenaOverlay arena={arena} hardwareTier="high" onClose={vi.fn()} />
      </TimelineProvider>
    </ChangeHistoryContextProvider>
  ))
  timeline!.loadTracks(USER_TRACKS)
  return {
    arena,
    timeline: timeline!,
    userFlame,
    replaceSilently,
    selectFighter,
    setDuration,
    setAnimationEnabled,
  }
}

describe('ArenaOverlay Load Victor', () => {
  afterEach(() => {
    cleanup()
    clearWebMcpContext()
  })

  it("gives the user's workspace back, then loads the victor over it", () => {
    const w = mountWorkspace()
    const userDuration =
      w.timeline.config().endFrame - w.timeline.config().startFrame

    void w.arena.startClash?.({ stance: 'balanced' })
    // The clash staged its own tracks over the user's.
    expect(w.timeline.tracks()).not.toEqual(USER_TRACKS)

    fireEvent.click(screen.getByRole('button', { name: /Skip to Results/i }))
    fireEvent.click(screen.getByRole('button', { name: /Load Victor/i }))

    expect(w.timeline.tracks()).toEqual(USER_TRACKS)
    expect(w.replaceSilently).toHaveBeenCalledWith(w.userFlame)
    expect(w.setDuration).toHaveBeenLastCalledWith(userDuration)
    expect(w.setAnimationEnabled).toHaveBeenLastCalledWith(false)
    expect(w.timeline.isPlaying()).toBe(false)
    // The fighter lands after the restore, as its own undo step.
    expect(w.selectFighter).toHaveBeenCalledTimes(1)
    expect(w.replaceSilently.mock.invocationCallOrder[0]).toBeLessThan(
      w.selectFighter.mock.invocationCallOrder[0]!,
    )
    expect(w.arena.open()).toBe(false)
  })
})
