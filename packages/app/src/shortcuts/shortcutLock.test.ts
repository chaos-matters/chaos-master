import '@/commands/builtins'
import { createRoot } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { useShortcutManager } from './useShortcutManager'
import type { SeatId } from '@/seats/seatId'

function drive(lock: 'screen' | 'seat', seatId: SeatId) {
  startPilot({
    mode: lock === 'screen' ? 'teach' : 'duel',
    title: 'Driving',
    stepBudget: 10,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
    seatId,
    lock,
  })
}

/**
 * Effects created inside `createRoot` are queued and flushed as it returns, so
 * the listener only exists once we are back out here.
 */
function mount() {
  const ctx = createMockCommandContext()
  const dispose = createRoot((dispose) => {
    useShortcutManager(ctx)
    return dispose
  })
  return { ctx, dispose }
}

/** Ctrl+S is `sidebar.open`, whose only effect is on the context we pass in. */
function pressCtrlS() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }),
  )
}

describe('shortcuts under an Arcade lock', () => {
  afterEach(() => {
    resetPilot()
  })

  it('keeps the viewer their own keyboard during a duel', () => {
    const { ctx, dispose } = mount()
    drive('seat', 'rival')

    pressCtrlS()

    // The seat lock covers the agent's half. Taking Ctrl+Z and the rest away
    // from the person playing the other half is the app fighting its user.
    expect(ctx.sidebar.setOpen).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('takes the keyboard while the agent owns the screen', () => {
    const { ctx, dispose } = mount()
    drive('screen', 'player')

    pressCtrlS()

    expect(ctx.sidebar.setOpen).not.toHaveBeenCalled()
    dispose()
  })

  it('gives it back when the session ends', () => {
    const { ctx, dispose } = mount()
    drive('screen', 'player')
    resetPilot()

    pressCtrlS()

    expect(ctx.sidebar.setOpen).toHaveBeenCalledTimes(1)
    dispose()
  })
})
