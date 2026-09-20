import { createEffect, createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { parseFlameXml } from '@/flame/flameXml'
import { createWorkspaceHandoff } from './workspaceHandoff'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

const flame = parseFlameXml(`<?xml version="1.0" encoding="UTF-8"?>
<flame name="Seed" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`)

const tracks: TimelineTrack[] = [
  {
    parameterPath: 'renderSettings.brightness',
    keyframes: [
      { frame: 0, value: 1 },
      { frame: 60, value: 2 },
    ],
  },
]

const config: TimelineConfig = {
  fps: 60,
  timeScale: 1,
  startFrame: 0,
  endFrame: 300,
  loop: false,
}

const handoff = (enterWorkspace = () => undefined) =>
  createWorkspaceHandoff({ enterWorkspace })

describe('the workspace hand-off', () => {
  it('carries a flame with its tracks and its timeline', () => {
    const seat = handoff()
    seat.seed({ flame, tracks, config })
    expect(seat.flame()?.metadata?.name).toBe(flame.metadata?.name)
    expect(seat.tracks()).toEqual(tracks)
    expect(seat.config()).toEqual(config)
  })

  it('leaves nothing standing from the seeding before it', () => {
    // A flame with an animation is seeded, and the welcome grid - live
    // before the workspace chunk has loaded - is tapped before anything
    // consumes it. A seeding that wrote only what it had to say handed that
    // starter flame the previous one's timeline.
    const seat = handoff()
    seat.seed({ flame, tracks, config, capability: 'animate' })
    seat.seed({ flame })
    expect(seat.flame()).toBeDefined()
    expect(seat.tracks()).toBeUndefined()
    expect(seat.config()).toBeUndefined()
    expect(seat.capability()).toBeUndefined()
  })

  it('empties on a seeding with nothing in it', () => {
    // What MainWorkspace does once it has consumed one.
    const seat = handoff()
    seat.seed({ flame, tracks, config, capability: 'animate' })
    seat.seed()
    expect(seat.flame()).toBeUndefined()
    expect(seat.tracks()).toBeUndefined()
    expect(seat.config()).toBeUndefined()
    expect(seat.capability()).toBeUndefined()
  })

  it('enters the editor only when the seed asks for it', () => {
    let entered = 0
    const seat = handoff(() => {
      entered++
    })
    seat.seed({ flame })
    expect(entered).toBe(0)
    seat.seed({ flame, enterWorkspace: true })
    expect(entered).toBe(1)
  })

  it('writes the whole hand-off in one pass', async () => {
    // Torn halfway, a reader sees the new flame beside the timeline the
    // seeding before it left - which is the state the welcome tap opened in.
    // Solid flushes on every write outside a batch, so an unbatched seeding
    // would show this reader each half on its own.
    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        const seat = handoff()
        const seen: Array<[string | undefined, number | undefined]> = []
        createEffect(() => {
          seen.push([seat.flame()?.metadata?.name, seat.config()?.fps])
        })
        queueMicrotask(() => {
          expect(seen).toHaveLength(1)
          seat.seed({ flame, config })
          expect(seen).toHaveLength(2)
          expect(seen[1]).toEqual([flame.metadata?.name, 60])
          dispose()
          resolve()
        })
      })
    })
  })
})
