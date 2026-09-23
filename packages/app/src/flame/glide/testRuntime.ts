/**
 * A glide runtime for tests: on a clock the test owns, mounted as the
 * workspace's, and counting the glides its callers start.
 *
 * The count is the point. A change is presented by exactly one glide, and the
 * way that went wrong (code audit 2026-09-23, F1) was a command that glides
 * itself followed by a caller gliding the same change again. Every caller
 * reaches the runtime through `getGlideRuntime()`, so wrapping the mounted
 * instance sees every start, whoever makes it.
 */

import { deepClone } from '@/utils/clone'
import { createGlideRuntime, setGlideRuntime } from './runtime'
import type { GlideRuntime } from './runtime'
import type { GlideOptions } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type TestGlideWorld = {
  runtime: GlideRuntime
  /** The options of every glide started, in order. */
  starts: GlideOptions[]
  /** Move the animation clock on and run the frames that were due. */
  advance: (ms: number) => void
}

export function mountTestGlideRuntime(
  read: () => FlameDescriptor,
  write: (flame: FlameDescriptor) => void,
  /** A hidden tab: frames are requested and never called back. */
  options: { stalledFrames?: boolean } = {},
): TestGlideWorld {
  let time = 0
  let pending: ((time: number) => void)[] = []
  const inner = createGlideRuntime({
    readFlame: () => deepClone(read()),
    writeFlame: (next) => {
      write(deepClone(next))
    },
    now: () => time,
    requestFrame: (callback) => {
      if (options.stalledFrames === true) return 0
      pending.push(callback)
      return pending.length
    },
    cancelFrame: () => {
      pending = []
    },
  })
  const starts: GlideOptions[] = []
  const runtime: GlideRuntime = {
    ...inner,
    glideFrom(from, glide = {}) {
      starts.push({ ...glide })
      return inner.glideFrom(from, glide)
    },
    glideTo(target, glide = {}) {
      starts.push({ ...glide })
      return inner.glideTo(target, glide)
    },
  }
  setGlideRuntime(runtime)
  return {
    runtime,
    starts,
    advance(ms) {
      time += ms
      const due = pending
      pending = []
      for (const callback of due) callback(time)
    },
  }
}
