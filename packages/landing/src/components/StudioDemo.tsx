import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { example45 } from '@/flame/examples/example45'
import { createDragHandler } from '@/utils/createDragHandler'
import { posterFor, prettyVariation, PREVIEW_QUALITY } from '../lib/flame'
import PosterFlame from './PosterFlame'

/**
 * Interactive "Studio" demo — the live flame viewport and the TRANSFORMS panel
 * share one reactive flame store, so:
 *   • dragging an affine value (a–f) scrubs it and the flame re-solves live, and
 *   • scrolling over the viewport zooms the camera (clamped).
 * Affine edits don't recompile the IFS pipeline (the shader keys only on
 * variation structure), so scrubbing just resets accumulation — cheap and smooth.
 */
const AFFINE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const
const SWATCHES = ['#06d6c8', '#d4e157', '#ff5e7e', '#60a5fa', '#a3e635']

type Affine = Record<(typeof AFFINE_KEYS)[number], number>
const TWO_PI = Math.PI * 2

/**
 * Compose a 2×2 similarity M = [[m00,m01],[m10,m11]] (+ translation delta) onto
 * an affine's OUTPUT side — same convention as the app's smartMutateAffine2D:
 * x' = a·x + b·y + c, y' = d·x + e·y + f, so the linear part is [[a,b],[d,e]]
 * and the translation is (c,f). Keeps linear part and translation consistent.
 */
function composeAffine(
  m: Affine,
  m00: number,
  m01: number,
  m10: number,
  m11: number,
  dx = 0,
  dy = 0,
): Affine {
  return {
    a: m00 * m.a + m01 * m.d,
    b: m00 * m.b + m01 * m.e,
    c: m00 * m.c + m01 * m.f + dx,
    d: m10 * m.a + m11 * m.d,
    e: m10 * m.b + m11 * m.e,
    f: m10 * m.c + m11 * m.f + dy,
  }
}

/**
 * Canned affine morphs for the "animate" button. Each maps (base affine,
 * progress t∈[0,1], transform index i) to the current affine. Every morph
 * vanishes to the identity at BOTH t=0 and t=1 (the sin envelopes are zero
 * there), so a run resolves cleanly back to the flame it started from — no
 * cumulative drift across repeated plays.
 */
const MORPHS: ReadonlyArray<(m: Affine, t: number, i: number) => Affine> = [
  // rotate the whole map there-and-back
  (m, t) => {
    const th = Math.sin(t * Math.PI) * 0.9
    const c = Math.cos(th)
    const s = Math.sin(th)
    return composeAffine(m, c, -s, s, c)
  },
  // breathe — isotropic scale pulse
  (m, t) => {
    const s = 1 + Math.sin(t * Math.PI) * 0.3
    return composeAffine(m, s, 0, 0, s)
  },
  // sway — a full rotate + anisotropic squash wobble
  (m, t) => {
    const w = Math.sin(t * TWO_PI)
    const th = w * 0.3
    const c = Math.cos(th)
    const s = Math.sin(th)
    const sx = 1 + w * 0.22
    const sy = 1 - w * 0.22
    return composeAffine(m, c * sx, -s * sy, s * sx, c * sy)
  },
  // twist — per-transform phase under a shared envelope (cascading curl)
  (m, t, i) => {
    const env = Math.sin(t * Math.PI)
    const th = env * Math.cos(i * 1.3 + t * 3) * 0.7
    const c = Math.cos(th)
    const s = Math.sin(th)
    const sc = 1 + env * 0.12
    return composeAffine(m, c * sc, -s * sc, s * sc, c * sc)
  },
]

export default function StudioDemo() {
  const [flame, setFlame] = createStore<typeof example45>(
    structuredClone(example45),
  )
  const [animating, setAnimating] = createSignal(false)

  // Don't run the live viewport while the Studio is scrolled out of view (the
  // poster shows instead); it's interactive, so no freeze — just gate.
  const [inView, setInView] = createSignal(true)
  let viewportRef: HTMLDivElement | undefined
  onMount(() => {
    const el = viewportRef
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting)
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    onCleanup(() => {
      io.disconnect()
    })
  })

  const tids = Object.keys(example45.transforms)
  const total = tids.reduce(
    (s, tid) => s + (example45.transforms as never)[tid].probability,
    0,
  )

  // Scrub a value via the app's robust drag handler (setPointerCapture +
  // document-level pointer listeners + multi-touch aware + auto-cleanup on
  // unmount), so dragging a number works the same on mouse, pen and touch. The
  // handler only passes the event, so the target value is stashed on pointerdown.
  let scrubTarget: { tid: string; key: string } | undefined
  const startScrub = createDragHandler((initEvent) => {
    if (animating() || !scrubTarget) return undefined
    const { tid, key } = scrubTarget
    const startX = initEvent.clientX
    const startV = (flame.transforms as never)[tid].preAffine[key] as number
    document.body.style.cursor = 'ew-resize'
    // Android reclaims the touch as a page scroll and fires pointercancel
    // mid-drag (freezing the scrub) — `touch-action: none` alone isn't reliable
    // on a small inline target. preventDefault every touchmove for the duration
    // of the drag so the gesture stays ours. Removed in onDone.
    const blockScroll = (e: TouchEvent) => {
      e.preventDefault()
    }
    document.addEventListener('touchmove', blockScroll, { passive: false })
    return {
      onPointerMove(ev) {
        const next = +(startV + (ev.clientX - startX) * 0.004).toFixed(3)
        setFlame(
          'transforms',
          tid as never,
          'preAffine' as never,
          key as never,
          next as never,
        )
      },
      onDone() {
        document.removeEventListener('touchmove', blockScroll)
        document.body.style.cursor = ''
      },
    }
  })

  // --- canned animation (the "animate" button) ----------------------------
  // Drives the same store path the panel scrubs, so the flame morphs live (and
  // the panel numbers animate with it). rAF recomputes every frame from the base
  // snapshot, so there's no float drift; runs always resolve back to the base.
  let animRaf = 0
  let animBase: Record<string, Affine> | undefined

  const snapshotAffines = (): Record<string, Affine> => {
    const snap: Record<string, Affine> = {}
    for (const tid of tids) {
      snap[tid] = { ...((flame.transforms as never)[tid].preAffine as Affine) }
    }
    return snap
  }
  const applyAffines = (map: Record<string, Affine>) => {
    for (const tid of tids) {
      setFlame(
        'transforms',
        tid as never,
        'preAffine' as never,
        map[tid] as never,
      )
    }
  }
  const cancelAnim = () => {
    if (animRaf) cancelAnimationFrame(animRaf)
    animRaf = 0
  }

  function toggleAnimate() {
    if (animating()) {
      // stop early → snap back to the base it started from
      cancelAnim()
      if (animBase) applyAffines(animBase)
      animBase = undefined
      setAnimating(false)
      return
    }
    const base = snapshotAffines()
    animBase = base
    const morph = MORPHS[Math.floor(Math.random() * MORPHS.length)]
    const duration = 2600 + Math.random() * 1100
    const start = globalThis.performance.now()
    setAnimating(true)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const frame: Record<string, Affine> = {}
      tids.forEach((tid, i) => {
        frame[tid] = morph(base[tid], t, i)
      })
      applyAffines(frame)
      if (t < 1) {
        animRaf = requestAnimationFrame(tick)
      } else {
        applyAffines(base) // settle exactly on the base
        animRaf = 0
        animBase = undefined
        setAnimating(false)
      }
    }
    animRaf = requestAnimationFrame(tick)
  }

  onCleanup(cancelAnim)

  function reset() {
    cancelAnim()
    animBase = undefined
    setAnimating(false)
    const fresh = structuredClone(example45)
    for (const tid of tids) {
      setFlame(
        'transforms',
        tid as never,
        'preAffine' as never,
        (fresh.transforms as never)[tid].preAffine,
      )
    }
  }

  return (
    <div class="studio-stage">
      <div class="studio-viewport" ref={viewportRef}>
        <PosterFlame
          flame={flame}
          poster={posterFor('example45')}
          posterClass="plate-canvas"
          inView={inView}
          quality={PREVIEW_QUALITY}
          canvasClass="plate-canvas"
          interactive2D
        />
        <span class="corner c1" />
        <span class="corner c2" />
        <span class="corner c3" />
        <span class="corner c4" />
        <div class="hud">
          <div class="row">
            <span>VIEWPORT · live</span>
            <span>spectrum swirl</span>
          </div>
          <div class="row">
            <span>drag to pan · pinch / scroll to zoom</span>
            <span>drag values</span>
          </div>
        </div>
      </div>

      <div class="panel" classList={{ animating: animating() }}>
        <div class="ph">
          <span>transforms</span>
          <div class="ph-actions">
            <button
              class="ph-btn animate"
              classList={{ running: animating() }}
              type="button"
              onClick={toggleAnimate}
            >
              <Show
                when={animating()}
                fallback={
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
                  </svg>
                }
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect
                    x="4"
                    y="4"
                    width="8"
                    height="8"
                    rx="1.5"
                    fill="currentColor"
                  />
                </svg>
              </Show>
              {animating() ? 'stop' : 'animate'}
            </button>
            <button class="ph-btn reset" type="button" onClick={reset}>
              reset
            </button>
          </div>
        </div>
        <For each={tids}>
          {(tid, i) => (
            <div class="xform">
              <div class="xh">
                <span
                  class="swatch"
                  style={`background:${SWATCHES[i() % SWATCHES.length]}`}
                />
                F{i()}
                <span class="prob">
                  p{' '}
                  {(
                    (flame.transforms as never)[tid].probability / total
                  ).toFixed(2)}
                </span>
              </div>
              <div class="matrix">
                <For each={AFFINE_KEYS}>
                  {(k) => (
                    <span>
                      {k}{' '}
                      <b
                        class="scrub"
                        onPointerDown={(e) => {
                          scrubTarget = { tid, key: k }
                          startScrub(e)
                        }}
                      >
                        {(
                          (flame.transforms as never)[tid].preAffine[
                            k
                          ] as number
                        ).toFixed(2)}
                      </b>
                    </span>
                  )}
                </For>
              </div>
              <div class="vbar">
                <For
                  each={Object.values(
                    (flame.transforms as never)[tid].variations,
                  )}
                >
                  {(v: never) => (
                    <span class="vtag">
                      {prettyVariation((v as { type: string }).type)}{' '}
                      {(v as { weight: number }).weight}
                    </span>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
