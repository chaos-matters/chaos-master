import { createEffect, createSignal, createUniqueId, For, onCleanup, Show, } from 'solid-js'
import { Portal } from 'solid-js/web'
import { focusSelectors, resolveFocusElement, revealFocusElement, } from '@/recorder/focus'
import styles from './ReplaySpotlight.module.css'
import type { RecordedAction } from '@/recorder/schema'

/**
 * Replay follow-cam: keep the generated flame pristine, quiet the editor
 * chrome, reveal the exact control being changed, and caption the step.
 *
 * The scrim is an SVG mask rather than the old single giant box-shadow. A
 * mask can preserve both the flame canvas and the current control, while
 * deliberately dimming sidebar/timeline chrome that overlaps the canvas.
 */

type Rect = { x: number; y: number; width: number; height: number }
type Viewport = { width: number; height: number }

const TARGET_PADDING = 10
const TRANSPORT_PADDING = 6
const TAIL_MS = 900
const LAYOUT_SETTLE_MS = 400
const REGION_SELECTOR = '[data-replay-region]'

function sameRect(a: Rect | undefined, b: Rect | undefined): boolean {
  return (
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height)
  )
}

function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  return (
    a.length === b.length && a.every((rect, index) => sameRect(rect, b[index]))
  )
}

function clippedRect(element: Element, padding = 0): Rect | undefined {
  const box = element.getBoundingClientRect()
  const left = Math.max(0, box.left - padding)
  const top = Math.max(0, box.top - padding)
  const right = Math.min(window.innerWidth, box.right + padding)
  const bottom = Math.min(window.innerHeight, box.bottom + padding)
  if (right <= left || bottom <= top) return undefined
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function sameElements(a: readonly Element[], b: readonly Element[]): boolean {
  return (
    a.length === b.length && a.every((element, index) => element === b[index])
  )
}

function containsReplayRegion(element: Element): boolean {
  return (
    element.matches(REGION_SELECTOR) ||
    element.querySelector(REGION_SELECTOR) !== null
  )
}

export function ReplaySpotlight(props: {
  action: RecordedAction | undefined
  finished: boolean
}) {
  const maskId = `replay-mask-${createUniqueId()}`
  const [targetRect, setTargetRect] = createSignal<Rect>()
  const [canvasRect, setCanvasRect] = createSignal<Rect>()
  const [dimRects, setDimRects] = createSignal<Rect[]>([])
  const [recessedRects, setRecessedRects] = createSignal<Rect[]>([])
  const [transportRects, setTransportRects] = createSignal<Rect[]>([])
  const [viewport, setViewport] = createSignal<Viewport>({
    width: window.innerWidth,
    height: window.innerHeight,
  })
  const [caption, setCaption] = createSignal<string>()

  let frame: number | undefined
  let tailTimer: ReturnType<typeof setTimeout> | undefined
  let tracking = false
  let trackingHint: string | undefined
  let trackedElement: Element | undefined
  let revealedElement: Element | undefined
  let trackedLayoutElements: Element[] = []
  let settleUntil = 0
  let resizeObserver: ResizeObserver | undefined
  let mutationObserver: MutationObserver | undefined
  let listenersAttached = false
  const mutationRoots = new Set<Node>()
  const layoutPeers = new Set<Node>()

  const elementContainsHint = (element: Element, hint: string) => {
    for (const selector of focusSelectors(hint)) {
      try {
        if (element.matches(selector) || element.querySelector(selector)) {
          return true
        }
      } catch {
        // Imported hints are user data; a malformed one must not stop replay.
      }
    }
    return false
  }

  const mutationTouchesLayout = (records: MutationRecord[]) => {
    return records.some((record) => {
      if (mutationRoots.has(record.target) || layoutPeers.has(record.target)) {
        return true
      }

      const nodes = [...record.addedNodes, ...record.removedNodes]
      if (
        nodes.some(
          (node) => node instanceof Element && containsReplayRegion(node),
        )
      ) {
        return true
      }

      const hint = trackingHint
      if (trackedElement === undefined && hint !== undefined) {
        const target = record.target
        if (target instanceof Element && elementContainsHint(target, hint)) {
          return true
        }
        return [...record.addedNodes].some(
          (node) => node instanceof Element && elementContainsHint(node, hint),
        )
      }
      return false
    })
  }

  const rebuildLayoutObservers = (elements: Element[]) => {
    if (sameElements(trackedLayoutElements, elements)) return
    trackedLayoutElements = elements
    mutationRoots.clear()
    layoutPeers.clear()
    resizeObserver?.disconnect()

    for (const element of elements) {
      for (
        let current: Element | null = element;
        current !== null;
        current = current.parentElement
      ) {
        mutationRoots.add(current)
        resizeObserver?.observe(current)
        const parent: Element | null = current.parentElement
        if (!parent) continue
        for (const sibling of Array.from(parent.children)) {
          if (sibling === current) continue
          layoutPeers.add(sibling)
          resizeObserver?.observe(sibling)
        }
      }
    }
  }

  const measure = () => {
    if (!tracking) return

    setViewport({ width: window.innerWidth, height: window.innerHeight })

    const regions = Array.from(document.querySelectorAll(REGION_SELECTOR))
    const canvasElements = regions.filter(
      (element) => element.getAttribute('data-replay-region') === 'canvas',
    )
    const dimElements = regions.filter(
      (element) => element.getAttribute('data-replay-region') === 'dim',
    )
    const recessedElements = regions.filter(
      (element) => element.getAttribute('data-replay-region') === 'recessed',
    )
    const transportElements = regions.filter(
      (element) => element.getAttribute('data-replay-region') === 'transport',
    )

    const nextCanvas = canvasElements
      .map((element) => clippedRect(element))
      .find((rect) => rect !== undefined)
    setCanvasRect((previous) =>
      sameRect(previous, nextCanvas) ? previous : nextCanvas,
    )

    const nextDimRects = dimElements.flatMap((element) => {
      const rect = clippedRect(element)
      return rect ? [rect] : []
    })
    setDimRects((previous) =>
      sameRects(previous, nextDimRects) ? previous : nextDimRects,
    )

    const nextRecessedRects = recessedElements.flatMap((element) => {
      const rect = clippedRect(element)
      return rect ? [rect] : []
    })
    setRecessedRects((previous) =>
      sameRects(previous, nextRecessedRects) ? previous : nextRecessedRects,
    )

    const nextTransportRects = transportElements.flatMap((element) => {
      const rect = clippedRect(element, TRANSPORT_PADDING)
      return rect ? [rect] : []
    })
    setTransportRects((previous) =>
      sameRects(previous, nextTransportRects) ? previous : nextTransportRects,
    )

    const hint = trackingHint
    const element = hint ? (resolveFocusElement(hint) ?? undefined) : undefined
    if (element !== trackedElement) {
      trackedElement = element
      revealedElement = undefined
    }

    rebuildLayoutObservers([
      ...canvasElements,
      ...dimElements,
      ...recessedElements,
      ...transportElements,
      ...(element ? [element] : []),
    ])

    if (!element) {
      setTargetRect(undefined)
      return
    }

    if (element !== revealedElement) {
      revealFocusElement(element)
      revealedElement = element
    }

    const nextTarget = clippedRect(element, TARGET_PADDING)
    setTargetRect((previous) =>
      sameRect(previous, nextTarget) ? previous : nextTarget,
    )
  }

  const scheduleMeasure = () => {
    if (frame !== undefined || !tracking) return
    frame = requestAnimationFrame((now) => {
      frame = undefined
      measure()
      if (now < settleUntil) scheduleMeasure()
    })
  }

  const stopTracking = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    tracking = false
    trackingHint = undefined
    trackedElement = undefined
    revealedElement = undefined
    trackedLayoutElements = []
    mutationRoots.clear()
    layoutPeers.clear()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    mutationObserver?.disconnect()
    mutationObserver = undefined
    if (listenersAttached) {
      document.removeEventListener('scroll', scheduleMeasure, true)
      window.removeEventListener('resize', scheduleMeasure)
      listenersAttached = false
    }
  }

  const track = (hint: string | undefined) => {
    tracking = true
    trackingHint = hint
    settleUntil = globalThis.performance.now() + LAYOUT_SETTLE_MS
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleMeasure)
    }
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver((records) => {
        if (mutationTouchesLayout(records)) scheduleMeasure()
      })
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'class',
          'style',
          'hidden',
          'open',
          'data-focus-id',
          'data-tour-target',
          'data-parameter-path',
          'data-replay-region',
        ],
      })
    }
    document.addEventListener('scroll', scheduleMeasure, {
      capture: true,
      passive: true,
    })
    window.addEventListener('resize', scheduleMeasure)
    listenersAttached = true

    measure()
    scheduleMeasure()
  }

  createEffect(() => {
    const action = props.action
    stopTracking()
    clearTimeout(tailTimer)
    tailTimer = undefined

    if (!action) {
      setTargetRect(undefined)
      setCanvasRect(undefined)
      setDimRects([])
      setRecessedRects([])
      setTransportRects([])
      setCaption(undefined)
      return
    }

    setCaption(action.note ?? action.label ?? action.id)
    track(action.focus)

    if (props.finished) {
      tailTimer = setTimeout(() => {
        setCaption(undefined)
        setTargetRect(undefined)
        setCanvasRect(undefined)
        setDimRects([])
        setRecessedRects([])
        setTransportRects([])
        stopTracking()
      }, TAIL_MS)
    }
  })

  onCleanup(() => {
    stopTracking()
    clearTimeout(tailTimer)
  })

  return (
    <Portal>
      <div class={styles.overlay} aria-hidden="true">
        <Show when={caption()}>
          <svg
            class={styles.scrim}
            viewBox={`0 0 ${viewport().width} ${viewport().height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={viewport().width}
                height={viewport().height}
              >
                <rect
                  data-replay-mask-role="base"
                  class={styles.maskDim}
                  width={viewport().width}
                  height={viewport().height}
                />
                <Show when={canvasRect()}>
                  {(canvas) => (
                    <rect
                      data-replay-mask-role="canvas"
                      class={styles.maskCutout}
                      x={canvas().x}
                      y={canvas().y}
                      width={canvas().width}
                      height={canvas().height}
                      rx="8"
                    />
                  )}
                </Show>
                <For each={dimRects()}>
                  {(rect) => (
                    <rect
                      data-replay-mask-role="chrome"
                      class={styles.maskDim}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                    />
                  )}
                </For>
                <For each={recessedRects()}>
                  {(rect) => (
                    <rect
                      data-replay-mask-role="recessed"
                      class={styles.maskCutout}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                    />
                  )}
                </For>
                <For each={transportRects()}>
                  {(rect) => (
                    <rect
                      data-replay-mask-role="transport"
                      class={styles.maskCutout}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      rx="14"
                    />
                  )}
                </For>
                <Show when={targetRect()}>
                  {(target) => (
                    <rect
                      data-replay-mask-role="target"
                      class={styles.maskCutout}
                      x={target().x}
                      y={target().y}
                      width={target().width}
                      height={target().height}
                      rx="10"
                    />
                  )}
                </Show>
              </mask>
            </defs>
            <rect
              class={styles.scrimFill}
              width={viewport().width}
              height={viewport().height}
              mask={`url(#${maskId})`}
            />
          </svg>
        </Show>

        <Show when={canvasRect()}>
          {(canvas) => (
            <div
              class={styles.canvasFrame}
              style={{
                left: `${canvas().x}px`,
                top: `${canvas().y}px`,
                width: `${canvas().width}px`,
                height: `${canvas().height}px`,
              }}
            />
          )}
        </Show>

        <Show when={targetRect()}>
          {(target) => (
            <div
              data-replay-target-frame
              class={styles.targetFrame}
              style={{
                left: `${target().x}px`,
                top: `${target().y}px`,
                width: `${target().width}px`,
                height: `${target().height}px`,
              }}
            />
          )}
        </Show>

        <Show when={caption()}>
          {(text) => <div class={styles.caption}>{text()}</div>}
        </Show>
      </div>
    </Portal>
  )
}
