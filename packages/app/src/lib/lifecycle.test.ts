import { describe, expect, it, vi } from 'vitest'
import { pushBackHandler } from './backStack'
import { loadLifecycle, onAppPause, useLifecyclePorts } from './lifecycle'
import type { LifecyclePorts } from '@chaos-master/mobile-runtime/lifecycle'

/** A fake platform: the test fires what the OS would fire. */
function fakePorts() {
  const backs = new Set<() => void>()
  const pauses = new Set<() => void>()
  const resumes = new Set<() => void>()
  const minimizeApp = vi.fn(() => Promise.resolve())
  const subscribe = (set: Set<() => void>) => (callback: () => void) => {
    set.add(callback)
    return () => set.delete(callback)
  }
  const ports: LifecyclePorts = {
    onBackButton: subscribe(backs),
    onPause: subscribe(pauses),
    onResume: subscribe(resumes),
    minimizeApp,
  }
  const fire = (set: Set<() => void>) => {
    set.forEach((callback) => {
      callback()
    })
  }
  return {
    ports,
    minimizeApp,
    pressBack: () => {
      fire(backs)
    },
    pause: () => {
      fire(pauses)
    },
    resume: () => {
      fire(resumes)
    },
  }
}

describe('lifecycle facade', () => {
  it('sends the back button to the registry before minimising', () => {
    const platform = fakePorts()
    useLifecyclePorts(platform.ports)
    const close = vi.fn()
    const dispose = pushBackHandler(close, 'test layer')
    platform.pressBack()
    expect(close).toHaveBeenCalledTimes(1)
    expect(platform.minimizeApp).not.toHaveBeenCalled()
    dispose()
  })

  it('minimises when nothing is registered', () => {
    const platform = fakePorts()
    useLifecyclePorts(platform.ports)
    platform.pressBack()
    expect(platform.minimizeApp).toHaveBeenCalledTimes(1)
  })

  it('tells whoever asked when the app goes to the background', () => {
    const platform = fakePorts()
    useLifecyclePorts(platform.ports)
    const paused = vi.fn()
    const stopPause = onAppPause(paused)
    platform.pause()
    expect(paused).toHaveBeenCalledTimes(1)

    // A disposed subscriber stops hearing about it.
    stopPause()
    platform.pause()
    expect(paused).toHaveBeenCalledTimes(1)
  })

  it('loads nothing in a web build', async () => {
    await expect(loadLifecycle()).resolves.toBeUndefined()
  })
})
