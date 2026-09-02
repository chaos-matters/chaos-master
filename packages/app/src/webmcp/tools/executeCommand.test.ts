import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommandTool } from './executeCommand'

describe('execute_command dispatch', () => {
  afterEach(() => {
    cancelSessionRecording()
    clearWebMcpContext()
  })

  it('records the command in an active session and honours beforeCommand', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })

    const result = await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: [0.42] },
      {},
    )

    expect(result).toEqual({ success: true, commandId: 'flame.setExposure' })
    expect(ctx.beforeCommand).toHaveBeenCalledTimes(1)
    expect(ctx.flameDescriptor().renderSettings.exposure).toBe(0.42)
    const session = stopSessionRecording()
    expect(session?.actions.map((a) => [a.id, a.args])).toEqual([
      ['flame.setExposure', [0.42]],
    ])
  })

  it('still rejects invalid args before dispatch', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const result = await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: ['not-a-number'] },
      {},
    )
    expect(result).toHaveProperty('error')
    expect(ctx.beforeCommand).not.toHaveBeenCalled()
  })
})
