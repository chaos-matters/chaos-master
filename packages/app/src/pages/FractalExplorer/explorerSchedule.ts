/**
 * What the explorer's frame loop does next, as a pure function of its
 * state, so the order of its rules can be tested without a GPU.
 *
 * A picture goes through a main pass (presented as it fills in), then up to
 * `sampleTarget - 1` jittered supersamples (iterated unseen, each added to
 * the average once complete). A colour change always wins: it is shown at
 * once, from the centre sample if the main pass is done, and abandons any
 * supersample in progress, which would otherwise mix two colourings.
 *
 * `withTimeout` bounds a GPU step, whose completion a lost device may never
 * report.
 */

export interface LoopState {
  /** A step is on the GPU; nothing may be encoded behind its back. */
  readonly inFlight: boolean
  /** A reference serves the picture, so it can iterate. */
  readonly iterating: boolean
  /** Samples in the average: 0 while the main pass runs. */
  readonly samples: number
  readonly sampleTarget: number
  /** A supersample is iterating, or has finished and is not yet added. */
  readonly refining: boolean
  readonly refineDone: boolean
  /** The colours changed since the display was last coloured. */
  readonly colourChanged: boolean
  readonly now: number
  readonly colourChangedAt: number
  readonly refineDelayMs: number
}

export type LoopAction =
  /** Nothing to do until a step completes or something changes. */
  | { readonly kind: 'idle' }
  /** A main-pass step, coloured and presented. */
  | { readonly kind: 'step' }
  /** A supersample step, not shown. */
  | { readonly kind: 'stepHidden' }
  /** Colour and present afresh; `finished` means from the centre sample. */
  | { readonly kind: 'recolour'; readonly finished: boolean }
  /** Add the finished supersample to the average. */
  | { readonly kind: 'accumulate' }
  /** Start the next supersample. */
  | { readonly kind: 'refine' }
  /** Start the next supersample after `ms`, once the colours are still. */
  | { readonly kind: 'later'; readonly ms: number }

export function nextAction(s: LoopState): LoopAction {
  if (s.inFlight) return { kind: 'idle' }
  const mainDone = s.iterating && s.samples > 0
  if (s.colourChanged) {
    // A main-pass step presents with the current colours anyway.
    if (s.iterating && !mainDone) return { kind: 'step' }
    return { kind: 'recolour', finished: mainDone }
  }
  if (s.refineDone) return { kind: 'accumulate' }
  if (s.refining) return { kind: 'stepHidden' }
  if (s.iterating && !mainDone) return { kind: 'step' }
  if (!mainDone || s.samples >= s.sampleTarget) return { kind: 'idle' }
  const wait = s.colourChangedAt + s.refineDelayMs - s.now
  return wait > 0 ? { kind: 'later', ms: wait } : { kind: 'refine' }
}

/** Sub-pixel offset of supersample `k`: the R2 sequence, 0 at the centre. */
export function jitterFor(k: number): { x: number; y: number } {
  const x = (0.5 + k * 0.7548776662466927) % 1
  const y = (0.5 + k * 0.5698402909980532) % 1
  return { x: x - 0.5, y: y - 0.5 }
}

/**
 * `promise`, or undefined if it has not settled within `ms`. A rejection is
 * passed on, as an Error.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(undefined)
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
