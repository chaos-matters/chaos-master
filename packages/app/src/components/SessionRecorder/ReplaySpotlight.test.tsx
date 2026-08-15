import { render } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplaySpotlight } from './ReplaySpotlight'
import type { RecordedAction } from '@/recorder/schema'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []

  readonly observe = vi.fn()
  readonly disconnect = vi.fn()

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = []

  readonly observe = vi.fn()
  readonly disconnect = vi.fn()

  constructor(readonly callback: MutationCallback) {
    FakeMutationObserver.instances.push(this)
  }
}

function fakeMutation(
  target: Node,
  type: MutationRecordType,
  addedNodes: Node[] = [],
): MutationRecord {
  return {
    addedNodes: addedNodes as unknown as NodeList,
    attributeName: type === 'attributes' ? 'style' : null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: [] as unknown as NodeList,
    target,
    type,
  }
}

describe('ReplaySpotlight tracking', () => {
  let nextFrameId = 1
  let frameCallbacks: Map<number, FrameRequestCallback>

  const flushFrame = (time: number) => {
    const queued = [...frameCallbacks.values()]
    frameCallbacks.clear()
    for (const callback of queued) callback(time)
  }

  beforeEach(() => {
    frameCallbacks = new Map()
    nextFrameId = 1
    FakeResizeObserver.instances = []
    FakeMutationObserver.instances = []
    vi.spyOn(globalThis.performance, 'now').mockReturnValue(0)
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++
        frameCallbacks.set(id, callback)
        return id
      }),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        frameCallbacks.delete(id)
      }),
    )
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.stubGlobal('MutationObserver', FakeMutationObserver)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('settles briefly, then remeasures only in response to layout events', () => {
    let left = 40
    const target = document.createElement('button')
    const scrollIntoView = vi.fn()
    target.dataset.focusId = 'gamma'
    target.scrollIntoView = scrollIntoView
    target.getBoundingClientRect = vi.fn(() => ({
      left,
      top: 20,
      width: 100,
      height: 30,
      right: left + 100,
      bottom: 50,
      x: left,
      y: 20,
      toJSON: () => ({}),
    }))
    const layoutSibling = document.createElement('div')
    const targetContainer = document.createElement('div')
    targetContainer.append(layoutSibling, target)
    document.body.append(targetContainer)

    const action: RecordedAction = {
      t: 0,
      id: 'flame.setGamma',
      args: [2.4],
      focus: 'focus:gamma',
    }
    const { unmount } = render(() => (
      <ReplaySpotlight action={action} finished={false} />
    ))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(FakeResizeObserver.instances[0]?.observe).toHaveBeenCalledWith(
      target,
    )
    expect(FakeMutationObserver.instances[0]?.observe).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ childList: true, subtree: true }),
    )
    expect(frameCallbacks.size).toBe(1)

    flushFrame(100)
    flushFrame(200)
    flushFrame(300)
    flushFrame(400)
    expect(frameCallbacks.size).toBe(0)

    const frameRequestCount = vi.mocked(requestAnimationFrame).mock.calls.length
    flushFrame(800)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(frameRequestCount)

    left = 80
    window.dispatchEvent(new Event('resize'))
    expect(frameCallbacks.size).toBe(1)
    flushFrame(1000)
    expect(frameCallbacks.size).toBe(0)

    const hole = document.body.querySelector<HTMLElement>(
      '[data-replay-target-frame]',
    )
    expect(hole?.style.left).toBe('70px')

    const unrelatedContainer = document.createElement('div')
    const unrelatedPlayhead = document.createElement('div')
    unrelatedContainer.append(unrelatedPlayhead)
    document.body.append(unrelatedContainer)
    const mutationObserver = FakeMutationObserver.instances[0]
    mutationObserver?.callback(
      [fakeMutation(unrelatedPlayhead, 'attributes')],
      mutationObserver as unknown as MutationObserver,
    )
    expect(frameCallbacks.size).toBe(0)

    const nestedPlayhead = document.createElement('span')
    target.append(nestedPlayhead)
    mutationObserver?.callback(
      [fakeMutation(nestedPlayhead, 'attributes')],
      mutationObserver as unknown as MutationObserver,
    )
    expect(frameCallbacks.size).toBe(0)

    mutationObserver?.callback(
      [fakeMutation(target, 'attributes')],
      mutationObserver as unknown as MutationObserver,
    )
    expect(frameCallbacks.size).toBe(1)
    flushFrame(1100)
    expect(frameCallbacks.size).toBe(0)

    mutationObserver?.callback(
      [fakeMutation(layoutSibling, 'attributes')],
      mutationObserver as unknown as MutationObserver,
    )
    expect(frameCallbacks.size).toBe(1)
    flushFrame(1150)
    expect(frameCallbacks.size).toBe(0)

    const replacementScrollIntoView = vi.fn()
    const replacement = document.createElement('button')
    replacement.dataset.focusId = 'gamma'
    replacement.scrollIntoView = replacementScrollIntoView
    replacement.getBoundingClientRect = vi.fn(() => ({
      left: 120,
      top: 20,
      width: 100,
      height: 30,
      right: 220,
      bottom: 50,
      x: 120,
      y: 20,
      toJSON: () => ({}),
    }))
    target.replaceWith(replacement)
    mutationObserver?.callback(
      [fakeMutation(document.body, 'childList', [replacement])],
      mutationObserver as unknown as MutationObserver,
    )
    expect(frameCallbacks.size).toBe(1)
    flushFrame(1200)
    expect(replacementScrollIntoView).toHaveBeenCalledTimes(1)
    expect(hole?.style.left).toBe('110px')

    unmount()
    expect(FakeResizeObserver.instances[0]?.disconnect).toHaveBeenCalled()
    expect(FakeMutationObserver.instances[0]?.disconnect).toHaveBeenCalled()
    window.dispatchEvent(new Event('resize'))
    expect(frameCallbacks.size).toBe(0)
  })

  it('keeps the flame and transport clear while re-dimming overlapping chrome', () => {
    const setBox = (
      element: Element,
      left: number,
      top: number,
      width: number,
      height: number,
    ) => {
      element.getBoundingClientRect = () => ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      })
    }

    const canvas = document.createElement('canvas')
    canvas.dataset.replayRegion = 'canvas'
    setBox(canvas, 0, 0, 800, 600)

    const bottomBar = document.createElement('div')
    bottomBar.dataset.replayRegion = 'dim'
    setBox(bottomBar, 0, 400, 800, 200)

    const timeline = document.createElement('section')
    timeline.dataset.replayRegion = 'recessed'
    setBox(timeline, 0, 400, 800, 160)

    const target = document.createElement('button')
    const scrollIntoView = vi.fn()
    target.dataset.focusId = 'tx:t3:variation:v1:type'
    target.scrollIntoView = scrollIntoView
    setBox(target, 650, 450, 80, 30)

    const transport = document.createElement('div')
    transport.dataset.replayRegion = 'transport'
    setBox(transport, 20, 520, 220, 50)
    bottomBar.append(timeline, target, transport)
    document.body.append(canvas, bottomBar)

    const action: RecordedAction = {
      t: 0,
      id: 'flame.setVariation',
      args: ['t3', 'v1', { type: 'linearVar' }],
      focus: 'focus:tx:t3:variation:v1:type',
    }
    const { unmount } = render(() => (
      <ReplaySpotlight action={action} finished={false} />
    ))

    const roles = Array.from(
      document.querySelectorAll('[data-replay-mask-role]'),
      (element) => element.getAttribute('data-replay-mask-role'),
    )
    expect(roles).toEqual([
      'base',
      'canvas',
      'chrome',
      'recessed',
      'transport',
      'target',
    ])

    const timelineCutout = document.querySelector(
      '[data-replay-mask-role="recessed"]',
    )
    expect(timelineCutout?.getAttribute('y')).toBe('400')
    expect(timelineCutout?.getAttribute('height')).toBe('160')

    const targetCutout = document.querySelector(
      '[data-replay-mask-role="target"]',
    )
    expect(targetCutout?.getAttribute('x')).toBe('640')
    expect(targetCutout?.getAttribute('width')).toBe('100')
    expect(scrollIntoView).toHaveBeenCalledOnce()

    unmount()
  })
})
