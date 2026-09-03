import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { deepClone } from '@/utils/clone'
import { clearWebMcpContext, getWebMcpContext, getWebMcpTarget, setWebMcpContext, setWebMcpTarget, } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
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

describe('disposing a seat', () => {
  it('takes its bridge entry with it', () => {
    const seat = createSeat('rival', createTestFlame())
    setWebMcpContext(seat.ctx, 'rival')
    setWebMcpTarget('rival')

    seat.dispose()

    // The bridge is a module-level map. A context left behind points at a
    // disposed root for the rest of the page's life, and the target points
    // every tool at it.
    expect(getWebMcpContext('rival')).toBeUndefined()
    expect(getWebMcpTarget()).toBe('player')
  })
})

describe('the bridge target', () => {
  afterEach(() => {
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
    setWebMcpTarget('player')
  })

  it('comes home when the workspace goes away mid-duel', () => {
    const seat = createSeat('rival', createTestFlame())
    setWebMcpContext(createMockCommandContext(), 'player')
    setWebMcpContext(seat.ctx, 'rival')
    setWebMcpTarget('rival')

    // MainWorkspace unmounting, with the duel still up.
    clearWebMcpContext('player')

    // Leaving the target on the rival stranded both duel tools, which read
    // 'player' explicitly, with no way back.
    expect(getWebMcpTarget()).toBe('player')
    seat.dispose()
  })

  it('stays put while the seat it points at is alive', () => {
    const seat = createSeat('rival', createTestFlame())
    setWebMcpContext(createMockCommandContext(), 'player')
    setWebMcpContext(seat.ctx, 'rival')
    setWebMcpTarget('rival')

    clearWebMcpContext('nobody' as never)

    expect(getWebMcpTarget()).toBe('rival')
    seat.dispose()
  })
})
