/**
 * The viewer's Glide switches over a workspace replay (REQ-RR-046): held from
 * the first step, set again before a rebuild, handed back when it ends. The
 * take's own steps switch them meanwhile, and that is put back. A switch
 * found other than the replay last left it was flipped by the viewer (through
 * their own agent), each switch on its own: that flip is their
 * setting from then on, the one a rebuild starts from and the end restores.
 */

import { captureGlideSwitches, restoreGlideSwitches, } from '@/flame/glide/runtime'
import type { GlideSwitches } from '@/flame/glide/types'

export type ReplayGlideLease = {
  /** Hold the viewer's switches, unless they are held already. */
  hold: () => void
  /** Run one of the take's steps, keeping a flip the viewer made before it. */
  step: <R>(run: () => R) => R
  /** Set the viewer's switches again, for a rebuild. */
  reset: () => void
  /** Hand the viewer's switches back and let go. */
  release: () => void
  /** The viewer's own switches: those held, flips kept, or else the live
   *  ones. What an export of the take starts from, wherever it is paused. */
  viewer: () => GlideSwitches
}

export function createReplayGlideLease(): ReplayGlideLease {
  let viewer: GlideSwitches | undefined
  /** The switches as the replay last left them. */
  let left: GlideSwitches | undefined

  function keepViewerFlips(): void {
    if (!viewer || !left) return
    const now = captureGlideSwitches()
    viewer = {
      enabled: now.enabled === left.enabled ? viewer.enabled : now.enabled,
      quality: now.quality === left.quality ? viewer.quality : now.quality,
    }
  }

  function reset(): void {
    keepViewerFlips()
    if (viewer) restoreGlideSwitches(viewer)
    left = viewer
  }

  return {
    hold() {
      viewer ??= captureGlideSwitches()
      left ??= viewer
    },
    step(run) {
      keepViewerFlips()
      try {
        return run()
      } finally {
        if (viewer) left = captureGlideSwitches()
      }
    },
    reset,
    release() {
      reset()
      viewer = undefined
      left = undefined
    },
    viewer() {
      keepViewerFlips()
      return viewer ?? captureGlideSwitches()
    },
  }
}
