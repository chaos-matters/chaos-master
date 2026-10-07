// A glide that replaces one in flight lands on the change the replaced glide
// was presenting, across the built-in examples.
//
// The shape is the double start of code audit 2026-09-23 (F1): a glide of a
// change starts, and a second glide of the same change starts from the same
// flame before the first has run a frame. The runtime used to read the second
// glide's target off the first one's frame 0. Where that frame differed from
// the start by anything at all (the fern's zoom 0.18 comes back as
// 0.17999999999999997), the second glide animated back to the start and
// settled there: 441 of 1976 such glides across all 4032 ordered pairs. All
// pairs take 20 s, so this runs each example into the next one.
import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createGlideRuntime } from './runtime'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

function doubleStart(from: FlameDescriptor, to: FlameDescriptor) {
  let flame = deepClone(to)
  let time = 0
  let pending: ((time: number) => void)[] = []
  const runtime = createGlideRuntime({
    readFlame: () => deepClone(flame),
    writeFlame: (next) => {
      flame = deepClone(next)
    },
    now: () => time,
    requestFrame: (callback) => {
      pending.push(callback)
      return pending.length
    },
    cancelFrame: () => {
      pending = []
    },
  })
  void runtime.glideFrom(deepClone(from), { durationMs: 800 })
  void runtime.glideFrom(deepClone(from), { durationMs: 600 })
  for (let frame = 0; frame < 80; frame++) {
    time += 16
    const due = pending
    pending = []
    for (const callback of due) callback(time)
  }
  return { landed: flame, gliding: runtime.isGliding() }
}

describe('a replaced glide, example into example', () => {
  it('lands every pair on its target', () => {
    const ids = Object.keys(examples) as (keyof typeof examples)[]
    const wrong: string[] = []
    ids.forEach((id, index) => {
      const next = ids[(index + 1) % ids.length]!
      const to = examples[next]
      const { landed, gliding } = doubleStart(examples[id], to)
      if (gliding || JSON.stringify(landed) !== JSON.stringify(to)) {
        wrong.push(`${id} -> ${next}`)
      }
    })
    expect(wrong).toEqual([])
  })
})
