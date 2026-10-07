import { describe, expect, it, vi } from 'vitest'
import { webLifecycle } from './lifecycle'

function fakeDocument() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    hidden: false,
    addEventListener(type: string, cb: () => void) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(cb))
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.get(type)?.delete(cb)
    },
    fire(type: string) {
      listeners.get(type)?.forEach((cb) => {
        cb()
      })
    },
  }
}

describe('webLifecycle', () => {
  it('maps visibilitychange to pause and resume', () => {
    const doc = fakeDocument()
    const ports = webLifecycle(doc as unknown as Document)
    const paused = vi.fn()
    const resumed = vi.fn()
    ports.onPause(paused)
    const stopResume = ports.onResume(resumed)
    doc.hidden = true
    doc.fire('visibilitychange')
    doc.hidden = false
    doc.fire('visibilitychange')
    expect(paused).toHaveBeenCalledTimes(1)
    expect(resumed).toHaveBeenCalledTimes(1)
    stopResume()
    doc.hidden = true
    doc.fire('visibilitychange')
    doc.hidden = false
    doc.fire('visibilitychange')
    expect(resumed).toHaveBeenCalledTimes(1)
  })

  it('has no back button and a minimize that resolves', async () => {
    const ports = webLifecycle(fakeDocument() as unknown as Document)
    const back = vi.fn()
    const stop = ports.onBackButton(back)
    stop()
    await expect(ports.minimizeApp()).resolves.toBeUndefined()
    expect(back).not.toHaveBeenCalled()
  })
})
