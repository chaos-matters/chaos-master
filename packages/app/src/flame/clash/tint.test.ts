/**
 * Team tint moves hue in the hue channel and chroma in the chroma channel,
 * the short way round the hue circle, and never greys a fighter out.
 */
import { describe, expect, it } from 'vitest'
import { hueOf, TEAM_COLOUR, tintColour, wrapAngle } from './tint'

const polar = (hueDeg: number, chroma: number) => ({
  x: chroma * Math.cos((hueDeg * Math.PI) / 180),
  y: chroma * Math.sin((hueDeg * Math.PI) / 180),
})
const distance = (a: number, b: number) => Math.abs(wrapAngle(a - b))
const degrees = (radians: number) => (radians * 180) / Math.PI

/** The OkLab hue of a `#rrggbb` sRGB colour, radians (Ottosson's matrices). */
function oklabHue(css: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(css.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return Math.atan2(bb, a)
}

describe('tintColour', () => {
  it('leaves a colour alone at amount 0', () => {
    const c = polar(200, 0.08)
    const out = tintColour(c, 'A', 0)
    expect(out.x).toBeCloseTo(c.x, 12)
    expect(out.y).toBeCloseTo(c.y, 12)
  })

  it('gives exactly the team colour at amount 1', () => {
    for (const team of ['A', 'B'] as const) {
      const out = tintColour(polar(300, 0.02), team, 1)
      expect(hueOf(out)).toBeCloseTo(wrapAngle(TEAM_COLOUR[team].hue), 12)
      expect(Math.hypot(out.x, out.y)).toBeCloseTo(TEAM_COLOUR[team].chroma, 12)
    }
  })

  it('keeps 1 - amount of the hue distance to the team', () => {
    const c = polar(160, 0.1)
    const before = distance(hueOf(c), TEAM_COLOUR.A.hue)
    const after = distance(hueOf(tintColour(c, 'A', 0.7)), TEAM_COLOUR.A.hue)
    expect(after).toBeCloseTo(before * 0.3, 10)
  })

  it('turns the short way round the circle', () => {
    // Team A sits near 48 deg. A colour at -40 deg (320) is 88 deg away the
    // short way, across 0; half way must land near 4 deg, not on the far
    // side near 184.
    const out = tintColour(polar(-40, 0.1), 'A', 0.5)
    expect(degrees(hueOf(out))).toBeCloseTo(
      (-40 + degrees(TEAM_COLOUR.A.hue)) / 2,
      6,
    )
  })

  it('keeps chroma where a straight (a, b) blend would lose it', () => {
    // A colour opposite team B's hue: blending (a, b) half way toward the
    // team point passes near grey; turning the hue does not.
    const opposite = polar(236.2 - 180, 0.15)
    const out = tintColour(opposite, 'B', 0.5)
    const blend = {
      x: (opposite.x + polar(236.2, 0.15).x) / 2,
      y: (opposite.y + polar(236.2, 0.15).y) / 2,
    }
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(0.15, 10)
    expect(Math.hypot(blend.x, blend.y)).toBeLessThan(0.01)
  })

  it('gives a grey transform the team hue', () => {
    const out = tintColour({ x: 0, y: 0 }, 'B', 0.5)
    expect(hueOf(out)).toBeCloseTo(wrapAngle(TEAM_COLOUR.B.hue), 12)
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(0.075, 12)
  })

  it('holds a bad amount to 0..1', () => {
    const c = polar(10, 0.05)
    expect(tintColour(c, 'A', 5)).toEqual(tintColour(c, 'A', 1))
    expect(tintColour(c, 'A', Number.NaN)).toEqual(tintColour(c, 'A', 0))
  })
})

describe('the team pair', () => {
  it("is Okabe and Ito's vermillion and sky blue", () => {
    expect(TEAM_COLOUR.A.css).toBe('#d55e00')
    expect(TEAM_COLOUR.B.css).toBe('#56b4e9')
  })

  it('turns a fighter to the OkLab hue of its colour on the page', () => {
    for (const team of ['A', 'B'] as const) {
      const { hue, css } = TEAM_COLOUR[team]
      expect(degrees(distance(hue, oklabHue(css)))).toBeLessThan(0.1)
    }
  })

  it('sits far apart on the hue circle', () => {
    const apart = distance(TEAM_COLOUR.A.hue, TEAM_COLOUR.B.hue)
    expect(degrees(apart)).toBeGreaterThan(150)
  })
})
