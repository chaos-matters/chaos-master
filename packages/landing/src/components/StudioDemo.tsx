import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { createStore } from 'solid-js/store'
import { example45 } from '@/flame/examples/example45'
import { createDragHandler } from '@/utils/createDragHandler'
import { encodeSharePayload } from '@/utils/jsonQueryParam'
import { APP_URL, posterFor, prettyVariation, PREVIEW_QUALITY, } from '../lib/flame'
import { webgpuLive } from '../lib/webgpuHealth'
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
// Per-transform identity colours: brand data colours, not chrome. Ember is
// deliberately absent — it means "action" everywhere else on the page.
const SWATCHES = ['teal', 'solar', 'rose', 'cyan', 'acid']

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
 * progress t∈[0,1], transform index i, direction dir∈{-1,+1}) to the current
 * affine. Every morph vanishes to the identity at BOTH t=0 and t=1 (the sin
 * envelopes are zero there), so a run resolves cleanly back to the flame it
 * started from — no cumulative drift across repeated plays. `dir` flips the
 * sign each run so even a repeated preset reads differently.
 */
type Morph = (m: Affine, t: number, i: number, dir: number) => Affine
const MORPHS: ReadonlyArray<Morph> = [
  // rotate the whole map there-and-back
  (m, t, _i, dir) => {
    const th = Math.sin(t * Math.PI) * 0.9 * dir
    const c = Math.cos(th)
    const s = Math.sin(th)
    return composeAffine(m, c, -s, s, c)
  },
  // breathe — isotropic scale pulse (dir → grow-out vs squeeze-in first)
  (m, t, _i, dir) => {
    const s = 1 + Math.sin(t * Math.PI) * 0.3 * dir
    return composeAffine(m, s, 0, 0, s)
  },
  // sway — a full rotate + anisotropic squash wobble
  (m, t, _i, dir) => {
    const w = Math.sin(t * TWO_PI) * dir
    const th = w * 0.3
    const c = Math.cos(th)
    const s = Math.sin(th)
    const sx = 1 + w * 0.22
    const sy = 1 - w * 0.22
    return composeAffine(m, c * sx, -s * sy, s * sx, c * sy)
  },
  // twist — per-transform phase under a shared envelope (cascading curl)
  (m, t, i, dir) => {
    const env = Math.sin(t * Math.PI)
    const th = env * Math.cos(i * 1.3 + t * 3) * 0.7 * dir
    const c = Math.cos(th)
    const s = Math.sin(th)
    const sc = 1 + env * 0.12
    return composeAffine(m, c * sc, -s * sc, s * sc, c * sc)
  },
  // shear — a skew pulse along x then settle (clearly non-rotational)
  (m, t, _i, dir) => {
    const k = Math.sin(t * Math.PI) * 0.6 * dir
    return composeAffine(m, 1, k, 0, 1)
  },
  // orbit — translate the whole map around a small circle and back to start
  (m, t, _i, dir) => {
    const env = Math.sin(t * Math.PI)
    const ang = t * TWO_PI * dir
    return composeAffine(
      m,
      1,
      0,
      0,
      1,
      Math.cos(ang) * env * 0.3 - env * 0.3,
      Math.sin(ang) * env * 0.3,
    )
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
  // Probabilities are stored raw; the renderer normalises by their live sum
  // (transformFunction.ts), so the panel shows the same normalised share — they
  // always add up to 1.00, and scrubbing one transform reweights the others
  // instead of letting a value read as >1.
  const probTotal = createMemo(
    () =>
      tids.reduce(
        (s, tid) =>
          s + ((flame.transforms as never)[tid].probability as number),
        0,
      ) || 1,
  )

  // "Open in app": encode the live (scrubbed) flame into the app's self-contained
  // ?flame= share link so a flame you tweak here opens straight in Lumen Apeiron.
  // Re-encoded only when the flame settles (bumpFlame), not every rAF frame.
  // Mirrors OpenInApp.tsx, driven by this component's live store.
  const [flameRev, setFlameRev] = createSignal(1)
  const bumpFlame = () => setFlameRev((n) => n + 1)
  const [appShareUrl] = createResource(flameRev, async () => {
    try {
      const encoded = await encodeSharePayload(flame)
      return `${APP_URL}/?flame=${encoded}`
    } catch {
      return APP_URL
    }
  })

  // Any number in the panel — an affine coef, a transform probability, or a
  // variation weight — is scrubbed through the same path: a spec says how to
  // read/write the live value, how fast a pixel moves it, how to round it, and
  // its clamp. (Probability/weight are renderer uniforms just like the affine —
  // see transformFunction.ts — so scrubbing any of them is a cheap live update,
  // no pipeline recompile.)
  type ScrubSpec = {
    get: () => number
    set: (v: number) => void
    step: number
    decimals: number
    min?: number
    max?: number
  }
  // Scrub a value via the app's robust drag handler (setPointerCapture +
  // document-level pointer listeners + multi-touch aware + auto-cleanup on
  // unmount), so dragging a number works the same on mouse, pen and touch. The
  // handler only passes the event, so the target spec is stashed on pointerdown.
  let scrubTarget: ScrubSpec | undefined
  const startScrub = createDragHandler((initEvent) => {
    if (animating() || !scrubTarget) return undefined
    const spec = scrubTarget
    const startX = initEvent.clientX
    const startV = spec.get()
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
        let next = startV + (ev.clientX - startX) * spec.step
        if (spec.min !== undefined) next = Math.max(spec.min, next)
        if (spec.max !== undefined) next = Math.min(spec.max, next)
        spec.set(+next.toFixed(spec.decimals))
      },
      onDone() {
        document.removeEventListener('touchmove', blockScroll)
        document.body.style.cursor = ''
        bumpFlame() // refresh the "open in app" link with the settled values
      },
    }
  })
  // Stash the spec, then hand the pointerdown to the drag handler.
  const beginScrub = (spec: ScrubSpec) => (e: PointerEvent) => {
    scrubTarget = spec
    startScrub(e)
  }

  // --- canned animation (the "animate" button) ----------------------------
  // Drives the same store path the panel scrubs, so the flame morphs live (and
  // the panel numbers animate with it). rAF recomputes every frame from the base
  // snapshot, so there's no float drift; runs always resolve back to the base.
  let animRaf = 0
  let animBase: Record<string, Affine> | undefined
  // Remember the last preset so two clicks in a row never replay the same one
  // (plain Math.random repeats ~1/N of the time, which read as "it's stuck").
  let lastMorphIdx = -1

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
    // Pick a preset that differs from the previous run, and flip its direction
    // at random — so repeated clicks visibly cycle through the canned moves.
    let idx = Math.floor(Math.random() * MORPHS.length)
    if (idx === lastMorphIdx && MORPHS.length > 1) {
      idx = (idx + 1) % MORPHS.length
    }
    lastMorphIdx = idx
    const morph = MORPHS[idx]
    const dir = Math.random() < 0.5 ? -1 : 1
    const duration = 2600 + Math.random() * 1100
    const start = globalThis.performance.now()
    setAnimating(true)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const frame: Record<string, Affine> = {}
      tids.forEach((tid, i) => {
        frame[tid] = morph(base[tid], t, i, dir)
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
      const ft = (fresh.transforms as never)[tid]
      // Restore everything the panel can scrub: affine coefs, probability, and
      // each variation weight — not just the affine.
      setFlame('transforms', tid as never, 'preAffine' as never, ft.preAffine)
      setFlame(
        'transforms',
        tid as never,
        'probability' as never,
        ft.probability,
      )
      for (const vid of Object.keys(ft.variations)) {
        setFlame(
          'transforms',
          tid as never,
          'variations' as never,
          vid as never,
          'weight' as never,
          (ft.variations as never)[vid].weight,
        )
      }
    }
    bumpFlame() // back to the base flame → refresh the "open in app" link
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
            <span>VIEWPORT · {webgpuLive() ? 'live' : 'static'}</span>
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
              title={
                animating() ? 'Stop' : 'Play a random animation each click'
              }
              onClick={toggleAnimate}
            >
              <Show
                when={animating()}
                fallback={
                  // A die — each click rolls a different canned move, so the
                  // icon signals the animation is random, not a single loop.
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect
                      x="2.5"
                      y="2.5"
                      width="11"
                      height="11"
                      rx="2.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.3"
                    />
                    <circle cx="5.5" cy="5.5" r="1.05" fill="currentColor" />
                    <circle cx="10.5" cy="5.5" r="1.05" fill="currentColor" />
                    <circle cx="8" cy="8" r="1.05" fill="currentColor" />
                    <circle cx="5.5" cy="10.5" r="1.05" fill="currentColor" />
                    <circle cx="10.5" cy="10.5" r="1.05" fill="currentColor" />
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
            <a
              class="ph-btn open"
              href={appShareUrl() ?? APP_URL}
              target="_blank"
              rel="noopener"
              title="Open this flame in Lumen Apeiron"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M21 13.5V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4.5" />
              </svg>
              open
            </a>
          </div>
        </div>
        <For each={tids}>
          {(tid, i) => (
            <div class="xform">
              <div class="xh">
                <span
                  class="swatch"
                  style={`background:var(--${SWATCHES[i() % SWATCHES.length]})`}
                />
                F{i()}
                <span class="prob">
                  p{' '}
                  <span
                    class="scrub"
                    onPointerDown={beginScrub({
                      get: () =>
                        (flame.transforms as never)[tid].probability as number,
                      set: (v) => {
                        setFlame(
                          'transforms',
                          tid as never,
                          'probability' as never,
                          v as never,
                        )
                      },
                      step: 0.003,
                      decimals: 2,
                      min: 0.01,
                      max: 1,
                    })}
                  >
                    {(
                      ((flame.transforms as never)[tid].probability as number) /
                      probTotal()
                    ).toFixed(2)}
                  </span>
                </span>
              </div>
              <div class="matrix">
                <For each={AFFINE_KEYS}>
                  {(k) => (
                    <span>
                      {k}{' '}
                      <b
                        class="scrub"
                        onPointerDown={beginScrub({
                          get: () =>
                            (flame.transforms as never)[tid].preAffine[
                              k
                            ] as number,
                          set: (v) => {
                            setFlame(
                              'transforms',
                              tid as never,
                              'preAffine' as never,
                              k as never,
                              v as never,
                            )
                          },
                          step: 0.004,
                          decimals: 3,
                        })}
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
                  each={Object.entries(
                    (flame.transforms as never)[tid].variations as Record<
                      string,
                      { type: string; weight: number }
                    >,
                  )}
                >
                  {([vid, v]) => (
                    <span class="vtag">
                      {prettyVariation(v.type)}{' '}
                      <span
                        class="scrub"
                        onPointerDown={beginScrub({
                          get: () =>
                            (flame.transforms as never)[tid].variations[vid]
                              .weight as number,
                          set: (w) => {
                            setFlame(
                              'transforms',
                              tid as never,
                              'variations' as never,
                              vid as never,
                              'weight' as never,
                              w as never,
                            )
                          },
                          step: 0.004,
                          decimals: 2,
                          min: 0,
                          max: 2,
                        })}
                      >
                        {(
                          (flame.transforms as never)[tid].variations[vid]
                            .weight as number
                        ).toFixed(2)}
                      </span>
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
