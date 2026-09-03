import '@/commands/builtins'
import { describe, expect, it } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { deepClone } from '@/utils/clone'
import { createTestFlame } from '@/webmcp/testUtils'
import { createSeat } from './seat'

/**
 * The seat's whole claim is that it edits a real flame with the app's real
 * commands while touching nothing another seat owns — the same claim
 * portalScript.test.ts makes for the Home portal, and the reason a duel can
 * run two editors at once.
 */
describe('createSeat', () => {
  it('edits its own flame with real commands', () => {
    const seat = createSeat('rival', createTestFlame())
    const before = Object.keys(seat.flame().transforms).length

    executeCommand('flame.addTransform', seat.ctx)
    executeCommand('flame.setExposure', seat.ctx, 0.75)

    expect(Object.keys(seat.flame().transforms).length).toBe(before + 1)
    expect(seat.flame().renderSettings.exposure).toBe(0.75)
    seat.dispose()
  })

  it('never writes into another seat', () => {
    const player = createSeat('player', createTestFlame())
    const rival = createSeat('rival', createTestFlame())
    const playerBefore = deepClone(player.flame())

    executeCommand('flame.addTransform', rival.ctx)
    executeCommand('flame.setExposure', rival.ctx, 0.9)
    executeCommand('flame.setVibrancy', rival.ctx, 0.1)

    expect(player.flame()).toEqual(playerBefore)
    expect(rival.flame()).not.toEqual(playerBefore)
    player.dispose()
    rival.dispose()
  })

  it('records into its own stream and stops cleanly', () => {
    const rival = createSeat('rival', createTestFlame())
    expect(rival.stream.start(rival.flame())).toEqual({ ok: true })

    executeCommand('flame.setExposure', rival.ctx, 0.3)

    expect(rival.stream.actionCount()).toBe(1)
    const session = rival.stream.stop()
    expect(session?.actions[0]?.id).toBe('flame.setExposure')
    rival.dispose()
  })

  it('carries its seat id on the context so the registry can route', () => {
    const rival = createSeat('rival', createTestFlame())
    expect(rival.ctx.seatId).toBe('rival')
    rival.dispose()
  })
})
