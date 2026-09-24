/**
 * A flame picked from a dialog must be the image left on screen, on Apple
 * WebKit too. Closing a dialog ran a view transition, and WebKit snapshots the
 * page on every frame of one; each snapshot presents a WebGPU canvas's swap
 * chain behind the renderer's back. A renderer that reached its quality limit,
 * and went idle, before the transition ended left the previous flame on screen
 * until something drew again (the iOS "shows the old flame until I drag").
 * Apple WebKit now gets no transition (lib/viewTransition.ts); where one runs
 * anyway, the render driver presents again once it ends.
 *
 * The canvas and the page's frame loop are models of WebKit's, cited below;
 * the render driver, the frame loop helper and the Modal are the real ones.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { createEffect, createRoot, createSignal, on } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '@/components/Modal/Modal'
import { useRequestModal } from '@/components/Modal/ModalContext'
import { createInteractiveRenderDriver } from './createInteractiveRenderDriver'
import type { Accessor } from 'solid-js'
import type { InteractiveRenderDriver } from './renderDriverTypes'

/**
 * A WebGPU canvas as WebKit presents it (Source/WebCore/html/canvas/
 * GPUCanvasContextCocoa.mm at 49480340a1, the file shipped through Safari 26
 * and iOS 26; 318799@main rewrote the snapshot read in 2026-08).
 */
class WebKitCanvas {
  // renderBuffers: three IOSurfaces for an HTMLCanvasElement (line 502).
  private readonly buffers: (string | undefined)[] = [
    undefined,
    undefined,
    undefined,
  ]
  private frameCount = 0
  private current: number | undefined
  private changed = false
  private queued = false
  private displayBuffer: number | undefined
  /** Snapshots taken of this canvas: each one presented behind the renderer. */
  snapshots = 0

  /** getCurrentTexture (558-570) and a pass that clears and draws `image`. */
  draw(image: string): void {
    if (this.current === undefined) {
      this.current = this.frameCount
      // markContextChangedAndNotifyCanvasObservers -> CanvasBase::didDraw ->
      // Document::addCanvasNeedingPreparationForDisplayOrFlush
      this.changed = true
      this.queued = true
    }
    this.buffers[this.current] = image
  }

  // present (602-613)
  private present(): void {
    this.changed = false
    this.frameCount = (this.frameCount + 1) % this.buffers.length
    this.current = undefined
  }

  // prepareForDisplay (615-633): show the current buffer, then present.
  private prepareForDisplay(): void {
    this.displayBuffer = this.frameCount
    this.present()
  }

  /**
   * HTMLCanvasElement::paint while a view transition snapshots the page
   * (HTMLCanvasElement.cpp 603-621): prepareForDisplay when the canvas changed,
   * then surfaceBufferToImageBuffer (353-392), which reads the current buffer
   * and presents it without setting the display buffer.
   */
  snapshot(): void {
    this.snapshots += 1
    if (this.changed) this.prepareForDisplay()
    this.present()
  }

  /** Document::prepareCanvasesForDisplayOrFlushIfNeeded (11686-11706). */
  prepareIfDrawn(): void {
    if (!this.queued) return
    this.queued = false
    this.prepareForDisplay()
  }

  /** The image the canvas layer shows. */
  onScreen(): string | undefined {
    return this.displayBuffer === undefined
      ? undefined
      : this.buffers[this.displayBuffer]
  }
}

// A transition runs 250 ms (the UA stylesheet's default), 15 frames at 60 Hz.
const TRANSITION_FRAMES = 15

// Drains every pending microtask: a macrotask runs only after all of them.
const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

/**
 * One page, updated the way WebCore's Page::updateRendering orders it
 * (Page.cpp 2330, 2363, 2511): rAF callbacks, then pending view transitions,
 * then canvases that were drawn. document.startViewTransition follows
 * ViewTransition.cpp: capture the old state at the next update (a snapshot),
 * call the update callback as a task, activate once it settles (a snapshot),
 * then snapshot the root on every animation frame (1053-1055) until the
 * animations end, which resolves `finished` (842-846).
 */
function createWebKitPage(canvas: WebKitCanvas, withTransitions: boolean) {
  let callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 1
  let now = 0
  let tasks: (() => void)[] = []
  let suppressed = false
  type Transition = {
    phase: 'pending' | 'callback' | 'animating'
    framesLeft: number
    update: (() => unknown) | undefined
    finished: PromiseWithResolvers<undefined>
  }
  let active: Transition | undefined
  let started = 0

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    callbacks.delete(id)
  })

  if (withTransitions) {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update?: () => unknown) => {
        const finished = Promise.withResolvers<undefined>()
        const ready = Promise.withResolvers<undefined>()
        started += 1
        active = {
          phase: 'pending',
          framesLeft: TRANSITION_FRAMES,
          update,
          finished,
        }
        return {
          ready: ready.promise,
          finished: finished.promise,
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => {},
        }
      },
    })
  } else {
    Reflect.deleteProperty(document, 'startViewTransition')
  }

  function performPendingViewTransitions(): void {
    const transition = active
    if (transition === undefined) return
    if (transition.phase === 'pending') {
      // setupViewTransition: captureOldState, then the update callback.
      canvas.snapshot()
      suppressed = true
      transition.phase = 'callback'
      tasks.push(() => {
        void Promise.resolve(transition.update?.()).then(() => {
          // activateViewTransition: updatePseudoElementRenderers snapshots.
          suppressed = false
          canvas.snapshot()
          transition.phase = 'animating'
        })
      })
      return
    }
    if (transition.phase !== 'animating') return
    // handleTransitionFrame
    if (transition.framesLeft === 0) {
      active = undefined
      transition.finished.resolve(undefined)
      return
    }
    transition.framesLeft -= 1
    canvas.snapshot()
  }

  async function frame(): Promise<void> {
    now += 1000 / 60
    if (!suppressed) {
      const due = [...callbacks.values()]
      callbacks = new Map()
      for (const cb of due) {
        cb(now)
        await flush()
      }
    }
    performPendingViewTransitions()
    await flush()
    canvas.prepareIfDrawn()
    const due = tasks
    tasks = []
    for (const task of due) {
      task()
      await flush()
    }
  }

  return {
    async frames(count: number): Promise<void> {
      for (let i = 0; i < count; i++) await frame()
    },
    transitionActive: () => active !== undefined,
    transitionsStarted: () => started,
  }
}

/**
 * The main renderer, reduced to what decides a present (Flam3.tsx): each tick
 * accumulates and draws until the quality limit, then the loop goes idle
 * (renderInterval Infinity past the limit). The present pump re-blits while
 * accumulating on WebKit. A new flame resets the accumulation.
 */
function createRenderer(
  canvas: WebKitCanvas,
  flame: Accessor<string>,
  modalOpen: Accessor<boolean>,
) {
  // Ticks to the quality limit. A phone at the 'mid' preset reaches it in a
  // few one-iteration ticks (Safari has no timestamp-query, so the estimator
  // stays at one iteration per tick), well inside a 250 ms transition.
  const LIMIT = 3
  let accumulated = 0
  const driver: InteractiveRenderDriver = createInteractiveRenderDriver({
    renderTick: () => {
      if (accumulated >= LIMIT) {
        return { iterations: 0, presented: false, hadWork: false }
      }
      accumulated += 1
      canvas.draw(flame())
      return { iterations: 1, presented: true, hadWork: true }
    },
    renderInterval: () => (modalOpen() ? Infinity : 0),
    continueRendering: () => accumulated < LIMIT,
    hasAccumulatedPoints: () => accumulated > 0,
    latestQueueFence: () => Promise.resolve(),
    exportDriverActive: () => false,
    gpuReady: () => true,
    presentToCanvas: () => {
      canvas.draw(flame())
    },
    isAppleWebKit: () => true,
    isExportRenderer: () => true,
    onStallResumed: () => {
      driver.redraw()
    },
  })
  createEffect(
    on(
      flame,
      () => {
        accumulated = 0
        driver.redraw()
      },
      { defer: true },
    ),
  )
}

/**
 * Loads a flame the way createLoadFlame does (LoadFlameModal.tsx 1298-1368):
 * the render loop stops while the dialog is open, the answer closes it, and
 * the flame is replaced after the replacement check.
 */
function LoadHost(props: {
  setModalOpen: (open: boolean) => void
  setFlame: (flame: string) => void
  onReady: (load: () => Promise<void>) => void
}) {
  const request = useRequestModal()
  props.onReady(async () => {
    props.setModalOpen(true)
    const answer = await request<string>({
      content: (dialog) => (
        <button
          type="button"
          onClick={() => {
            dialog.respond('B')
          }}
        >
          Flame B
        </button>
      ),
    })
    props.setModalOpen(false)
    await Promise.resolve() // history.prepareReplace
    props.setFlame(answer)
  })
  return null
}

async function loadFlameB(withTransitions: boolean) {
  const canvas = new WebKitCanvas()
  const page = createWebKitPage(canvas, withTransitions)
  const [flame, setFlame] = createSignal('A')
  const [modalOpen, setModalOpen] = createSignal(false)
  let load: (() => Promise<void>) | undefined
  const disposeRenderer = createRoot((dispose) => {
    createRenderer(canvas, flame, modalOpen)
    return dispose
  })
  render(() => (
    <Modal>
      <LoadHost
        setModalOpen={setModalOpen}
        setFlame={setFlame}
        onReady={(fn) => {
          load = fn
        }}
      />
    </Modal>
  ))

  await page.frames(10)
  expect(canvas.onScreen()).toBe('A')

  const loaded = load?.()
  await page.frames(3)
  document.querySelector<HTMLButtonElement>('dialog button')?.click()
  await page.frames(TRANSITION_FRAMES + 10)
  await loaded
  expect(page.transitionActive()).toBe(false)
  // Long after: nothing but a new draw would change the canvas now.
  await page.frames(30)
  const seen = {
    onScreen: canvas.onScreen(),
    transitionsStarted: page.transitionsStarted(),
    snapshots: canvas.snapshots,
  }
  disposeRenderer()
  return seen
}

/** The engine as utils/platform's isAppleWebKit sees it: navigator.vendor. */
function onEngine(vendor: string) {
  vi.spyOn(globalThis.navigator, 'vendor', 'get').mockReturnValue(vendor)
}

describe('a flame loaded from a dialog, on a canvas that presents like WebKit', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it('on Apple WebKit, is on screen with no view transition and no snapshot', async () => {
    onEngine('Apple Computer, Inc.')
    expect(await loadFlameB(true)).toEqual({
      onScreen: 'B',
      transitionsStarted: 0,
      snapshots: 0,
    })
  })

  it('where a view transition runs anyway, is on screen once it has faded out', async () => {
    // An engine that presents like WebKit's but is not recognised as Apple
    // WebKit: the transition runs, and the driver presents once it ends.
    onEngine('')
    const seen = await loadFlameB(true)
    expect(seen.transitionsStarted).toBe(1)
    expect(seen.snapshots).toBeGreaterThan(0)
    expect(seen.onScreen).toBe('B')
  })

  it('is on screen when the browser has no view transitions', async () => {
    // The control: without the snapshots, the last draw is what is shown.
    onEngine('')
    expect(await loadFlameB(false)).toEqual({
      onScreen: 'B',
      transitionsStarted: 0,
      snapshots: 0,
    })
  })
})
