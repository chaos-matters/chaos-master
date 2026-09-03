import { afterEach, describe, expect, it } from 'vitest'
import { clearWebMcpContext, getWebMcpContext, getWebMcpTarget, setWebMcpContext, setWebMcpTarget, } from './contextBridge'
import { createMockCommandContext } from './testUtils'

describe('webmcp context bridge', () => {
  afterEach(() => {
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
  })

  it('behaves as one context when nothing sets a target', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(getWebMcpTarget()).toBe('player')
    expect(getWebMcpContext()).toBe(ctx)
    clearWebMcpContext()
    expect(getWebMcpContext()).toBeUndefined()
  })

  it('redirects the no-argument read to the current target', () => {
    const player = createMockCommandContext()
    const rival = createMockCommandContext()
    setWebMcpContext(player)
    setWebMcpContext(rival, 'rival')
    expect(getWebMcpContext()).toBe(player)

    setWebMcpTarget('rival')
    // Every tool reads with no argument, so all of them follow the target.
    expect(getWebMcpContext()).toBe(rival)
    // An explicit read still reaches the seat it names.
    expect(getWebMcpContext('player')).toBe(player)
  })

  it('resets the target when the targeted seat is cleared', () => {
    setWebMcpContext(createMockCommandContext())
    setWebMcpContext(createMockCommandContext(), 'rival')
    setWebMcpTarget('rival')
    clearWebMcpContext('rival')
    expect(getWebMcpTarget()).toBe('player')
    expect(getWebMcpContext()).toBeDefined()
  })
})
