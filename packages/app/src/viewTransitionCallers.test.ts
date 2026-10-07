// Guards that every view transition starts through lib/viewTransition.
//
// On Apple WebKit a view transition presents WebGPU canvases behind their
// renderers' backs on every frame it runs, so a renderer that went idle during
// one is left showing an old image. The render driver re-presents once each
// transition ends, and it learns that a transition ended only from
// lib/viewTransition. A direct document.startViewTransition call elsewhere
// would bring back the stale canvas for whatever that transition wraps: a
// flame loaded from a dialog, a draw-mode change, a sidebar or timeline
// toggle that resizes the canvas.
import { describe, expect, it } from 'vitest'

const SOURCES: Record<string, string> = import.meta.glob(
  ['./**/*.{ts,tsx}', '!./**/*.{test,spec}.{ts,tsx}', '!./**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true },
)

const HELPER = './lib/viewTransition.ts'
const DIRECT_CALL = /\.startViewTransition\s*\(/

describe('view transition callers', () => {
  it('start every view transition through lib/viewTransition', () => {
    const offenders = Object.entries(SOURCES).flatMap(([path, source]) =>
      path === HELPER
        ? []
        : source
            .split('\n')
            .flatMap((line, i) =>
              DIRECT_CALL.test(line)
                ? [`${path}:${i + 1}: ${line.trim()}`]
                : [],
            ),
    )
    expect(offenders).toEqual([])
  })

  it('reads the tree, helper included', () => {
    // A glob that matched nothing would pass the check above forever.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(500)
    expect(DIRECT_CALL.test(SOURCES[HELPER] ?? '')).toBe(true)
  })
})
