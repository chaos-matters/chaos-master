import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { clearNarration, narration, narrationLog } from '@/arcade/narration'
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { createMockCommandContext } from '@/webmcp/testUtils'

describe('lesson.note', () => {
  afterEach(() => {
    clearNarration()
    cancelSessionRecording()
  })

  it('sets the narration and is recorded like any command', () => {
    const ctx = createMockCommandContext()
    startSessionRecording(ctx.flameDescriptor())
    executeCommand('lesson.note', ctx, 'Adding a spherical variation next.')
    expect(narration()).toBe('Adding a spherical variation next.')
    expect(narrationLog()).toHaveLength(1)
    const session = stopSessionRecording()
    expect(session?.actions[0]).toMatchObject({
      id: 'lesson.note',
      args: ['Adding a spherical variation next.'],
      label: 'Narration',
    })
  })

  it('rejects empty, non-string and oversized text at preflight', () => {
    expect(preflightReplayCommand('lesson.note', [''])).toBeTypeOf('string')
    expect(preflightReplayCommand('lesson.note', [42])).toBeTypeOf('string')
    expect(preflightReplayCommand('lesson.note', ['x'.repeat(401)])).toBeTypeOf(
      'string',
    )
    expect(preflightReplayCommand('lesson.note', ['fine'])).toBeUndefined()
  })
})
