// Golden .flame corpus: every fixture must survive parse -> export -> parse.
// Fixtures are written from the format, never taken from a real gallery export,
// which would carry whatever metadata the author's file had in it.
//
// The known losses below predate v0.9.11 and are recorded in the audit's
// BUGS.md (docs/agent, #88). Each test pins today's wrong value on purpose:
// fixing the loss turns it red, which is the prompt to move the case into the
// passing corpus. They are plain tests rather than it.fails, which would also
// pass on a crash -- a renamed fixture, say -- and so test nothing.
import { describe, expect, it } from 'vitest'
import { exportFlameXml, parseFlameXml } from './flameXml'
import type { FlameDescriptor } from './schema/flameSchema'

const FIXTURES = import.meta.glob('./__fixtures__/*.flame', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Numbers to 1e-9: the OkLab colour bake leaves -7e-17 where 0 was meant. */
function rounded(value: unknown): unknown {
  if (typeof value === 'number') {
    const r = Math.round(value * 1e9) / 1e9
    return r === 0 ? 0 : r
  }
  if (Array.isArray(value)) return value.map(rounded)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rounded(v)]),
    )
  }
  return value
}

/** Ids are generated per parse, so transforms and variations compare in order. */
function structure(flame: FlameDescriptor, { colours = true } = {}) {
  return rounded({
    ...flame,
    transforms: Object.values(flame.transforms).map(({ color, ...t }) => ({
      ...t,
      ...(colours ? { color } : {}),
      variations: Object.values(t.variations),
    })),
  })
}

function roundTrip(flame: FlameDescriptor) {
  return parseFlameXml(exportFlameXml(flame, flame.metadata?.name))
}

describe('golden .flame round trip', () => {
  it('has a corpus to test', () => {
    expect(Object.keys(FIXTURES).length).toBeGreaterThanOrEqual(7)
  })

  it.each(Object.entries(FIXTURES))(
    '%s survives export and re-import',
    (_name, xml) => {
      const first = parseFlameXml(xml)
      // An embedded palette's colour chroma is a known loss, tested below.
      const colours = !xml.includes('<palette')
      expect(structure(roundTrip(first), { colours })).toEqual(
        structure(first, { colours }),
      )
    },
  )
})

/** A corpus fixture by file name; a rename fails here, not silently later. */
function fixture(name: string): string {
  const xml = FIXTURES[`./__fixtures__/${name}`]
  expect(xml, `fixture ${name}`).toBeTypeOf('string')
  return xml!
}

describe('known losses in .flame export', () => {
  const base = () => parseFlameXml(fixture('plain-2d.flame'))

  it('loses transform colour chroma from an embedded palette', () => {
    // Export writes only an angle-derived colour index and no palette, so the
    // re-import rebuilds every colour at a fixed 0.3 chroma.
    const first = parseFlameXml(fixture('palette.flame'))
    const chroma = (f: FlameDescriptor) =>
      Object.values(f.transforms).map(
        ({ color }) => Math.round(Math.hypot(color.x, color.y) * 1e6) / 1e6,
      )
    expect(chroma(first).some((c) => c !== 0.3)).toBe(true)
    expect(chroma(roundTrip(first)).every((c) => c === 0.3)).toBe(true)
  })

  it('quantizes a background colour to 1/255 steps', () => {
    const flame = base()
    flame.renderSettings.backgroundColor = [0.1, 0.1, 0.2]
    expect(roundTrip(flame).renderSettings.backgroundColor).toEqual([
      26 / 255,
      26 / 255,
      51 / 255,
    ])
  })

  it('brings a very dark background channel back at full intensity', () => {
    // Export rounds 0.004 * 255 to 1; import reads a channel of 1 as the 0-1
    // scale, so a near-black channel comes back at 1.
    const flame = base()
    flame.renderSettings.backgroundColor = [0.004, 0, 0]
    expect(roundTrip(flame).renderSettings.backgroundColor?.[0]).toBe(1)
  })

  it('rounds exposure to a whole brightness step', () => {
    // brightness = round(2 ** (1 / 1.5)) = 2, which re-imports as 1.5.
    const flame = base()
    flame.renderSettings.exposure = 1
    expect(roundTrip(flame).renderSettings.exposure).toBeCloseTo(1.5, 6)
  })
})
