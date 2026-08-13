import { createRoot, createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementIsScrolling } from './isScrolling'

describe('useElementIsScrolling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reacts to its gallery scroll, not surrounding page scroll', async () => {
    const gallery = document.createElement('div')
    let setElement!: (element: HTMLElement | undefined) => void
    let scrolling!: () => boolean

    const dispose = createRoot((disposeRoot) => {
      const [element, setElement_] = createSignal<HTMLElement>()
      setElement = setElement_
      scrolling = useElementIsScrolling(element)
      return disposeRoot
    })

    setElement(gallery)
    await Promise.resolve()

    window.dispatchEvent(new Event('scroll'))
    expect(scrolling()).toBe(false)

    gallery.dispatchEvent(new Event('scroll'))
    expect(scrolling()).toBe(true)

    vi.advanceTimersByTime(179)
    expect(scrolling()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(scrolling()).toBe(false)

    dispose()
  })
})
