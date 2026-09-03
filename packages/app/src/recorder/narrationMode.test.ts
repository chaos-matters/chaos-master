import '@/commands/builtins/lesson'
import '@/commands/builtins/view'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { setNarrationAsStep } from './narrationMode'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from './recorder'
import type { CommandContext } from '@/commands/types'

afterEach(() => {
  cancelSessionRecording()
  setNarrationAsStep(true)
})

function pixelRatioContext() {
  const [pixelRatio, setPixelRatio] = createSignal(1)
  return { pixelRatio, setPixelRatio } as unknown as CommandContext
}

describe('narration as its own step', () => {
  it('records a step per sentence when the toggle is on', () => {
    const ctx = pixelRatioContext()
    expect(startSessionRecording(examples.example1).ok).toBe(true)

    executeCommand('lesson.note', ctx, 'Watch the edges soften.')
    executeCommand('view.setPixelRatio', ctx, 0.5)
    const session = stopSessionRecording()!

    expect(session.actions).toMatchObject([
      { id: 'lesson.note', args: ['Watch the edges soften.'] },
      { id: 'view.setPixelRatio', args: [0.5] },
    ])
    expect(session.actions[1]?.note).toBeUndefined()
  })

  it('captions the next step instead when the toggle is off', () => {
    setNarrationAsStep(false)
    const ctx = pixelRatioContext()
    expect(startSessionRecording(examples.example1).ok).toBe(true)

    executeCommand('lesson.note', ctx, 'Watch the edges soften.')
    executeCommand('view.setPixelRatio', ctx, 0.5)
    const session = stopSessionRecording()!

    expect(session.actions).toHaveLength(1)
    expect(session.actions[0]).toMatchObject({
      id: 'view.setPixelRatio',
      note: 'Watch the edges soften.',
    })
  })

  it('does not count a folded sentence as an unnamed write', () => {
    setNarrationAsStep(false)
    const ctx = pixelRatioContext()
    expect(startSessionRecording(examples.example1).ok).toBe(true)

    executeCommand('lesson.note', ctx, 'Nothing follows this one.')
    const session = stopSessionRecording()!

    // A dropped sentence changed no document state, so the log is still a
    // faithful account of the take — it must not claim otherwise.
    expect(session.actions).toHaveLength(0)
    expect(unnamedWriteCount()).toBe(0)
  })

  it('keeps only the most recent sentence when two arrive in a row', () => {
    setNarrationAsStep(false)
    const ctx = pixelRatioContext()
    expect(startSessionRecording(examples.example1).ok).toBe(true)

    executeCommand('lesson.note', ctx, 'First thought.')
    executeCommand('lesson.note', ctx, 'Actually, this one.')
    executeCommand('view.setPixelRatio', ctx, 0.5)
    const session = stopSessionRecording()!

    expect(session.actions).toMatchObject([
      { id: 'view.setPixelRatio', note: 'Actually, this one.' },
    ])
  })

  it('does not carry an unspent sentence into the next take', () => {
    setNarrationAsStep(false)
    const ctx = pixelRatioContext()

    expect(startSessionRecording(examples.example1).ok).toBe(true)
    executeCommand('lesson.note', ctx, 'Belongs to the first take.')
    stopSessionRecording()

    expect(startSessionRecording(examples.example1).ok).toBe(true)
    executeCommand('view.setPixelRatio', ctx, 0.5)
    const session = stopSessionRecording()!

    expect(session.actions[0]?.note).toBeUndefined()
  })
})
