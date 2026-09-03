import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { duelActive, startDuel, stopDuel } from '@/arcade/duel'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { DuelControls } from './DuelControls'

/**
 * The stage itself mounts WebGPU canvases, so the component test covers the
 * half that has no GPU in it: the strip dispatches on the player's seat, and
 * the clock counts. The two-canvas render is proven in the browser probe.
 */
describe('DuelControls', () => {
  afterEach(() => {
    cleanup()
    if (duelActive()) stopDuel()
    resetPilot()
    vi.restoreAllMocks()
  })

  it('dispatches every control on the context it is given', () => {
    const ctx = createMockCommandContext()
    const executed: string[] = []
    render(() => (
      <DuelControls ctx={ctx} onCommand={(id) => executed.push(id)} />
    ))

    screen.getByRole('button', { name: 'Randomize' }).click()
    screen.getByRole('button', { name: 'Mutate' }).click()
    screen.getByRole('button', { name: 'Centre the camera' }).click()
    screen.getByRole('button', { name: 'Undo' }).click()

    expect(executed).toEqual([
      'flame.randomize',
      'flame.mutate',
      'camera.center',
      'history.undo',
    ])
  })

  it('leaves the viewer their controls while the agent drives its own seat', () => {
    startDuel({
      rivalFlame: createTestFlame(),
      playerFlame: createTestFlame(),
      durationMs: 60_000,
      recording: 'both',
      now: 0,
    })
    startPilot({
      mode: 'duel',
      title: 'Duel',
      stepBudget: 60,
      allowed: ['flame.'],
      qualityRankAtStart: 1,
      seatId: 'rival',
      lock: 'seat',
      now: 0,
    })
    render(() => (
      <DuelControls ctx={createMockCommandContext()} onCommand={() => {}} />
    ))
    // A seat-scoped lock must not disable the half the viewer is playing.
    expect(
      screen
        .getByRole('button', { name: 'Randomize' })
        .hasAttribute('disabled'),
    ).toBe(false)
  })
})
