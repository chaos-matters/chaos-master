// A clash team's colour: a hue on the OkLab (a, b) plane, for every transform of that team.

/**
 * How far from grey a team tint sits in OkLab: about as saturated as the
 * editor's own colours, whose randomiser draws `a` and `b` within +-0.4.
 */
const TEAM_CHROMA = 0.3

type OkLabAB = { x: number; y: number }

const srgbToLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

/** An sRGB hex colour's OkLab hue, as a fraction of a turn (Ottosson's matrices). */
function okLabHueTurn(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) =>
    srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255),
  ) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return wrapTurn(Math.atan2(bb, a) / (2 * Math.PI))
}

/** A hue that ran past either end of the circle, back onto it. */
export function wrapTurn(turn: number): number {
  return turn - Math.floor(turn)
}

/**
 * The teams' colours, the Clash stage's: vermillion `#D55E00` and sky blue
 * `#56B4E9` from the Okabe-Ito palette, a pair colour-blind viewers can tell
 * apart. Only their hue is taken (47.5 and 236.2 degrees); the chroma is
 * `TEAM_CHROMA`, so a team reads as the colour on the flame's own brightness.
 */
export const TEAM_A_HUE = okLabHueTurn('#D55E00')
export const TEAM_B_HUE = okLabHueTurn('#56B4E9')

/**
 * A team's hue, a fraction of a turn, as a transform colour.
 *
 * A transform's `color` is an OkLab `(a, b)` pair. The arena's tint used to
 * write the hue into `a` and 1.0 into `b`, which put both teams in the same
 * yellow-orange; here the hue is an angle on the (a, b) plane.
 */
function teamTintColor(hue: number): OkLabAB {
  const angle = hue * 2 * Math.PI
  return { x: TEAM_CHROMA * Math.cos(angle), y: TEAM_CHROMA * Math.sin(angle) }
}

/** A transform colour as stored (an object, or a legacy pair), or grey. */
function colorOf(raw: unknown): OkLabAB {
  if (typeof raw === 'object' && raw !== null && 'x' in raw && 'y' in raw) {
    const { x, y } = raw
    return { x: Number(x) || 0, y: Number(y) || 0 }
  }
  if (Array.isArray(raw)) {
    return { x: Number(raw[0]) || 0, y: Number(raw[1]) || 0 }
  }
  return { x: 0, y: 0 }
}

/**
 * A transform's colour on a team: the team colour itself (`override`), or the
 * midpoint between the transform's own colour and it (`blend`).
 */
export function teamTintedColor(
  own: unknown,
  hue: number,
  mode: 'override' | 'blend',
): OkLabAB {
  const team = teamTintColor(hue)
  if (mode === 'override') return team
  const base = colorOf(own)
  return { x: (base.x + team.x) / 2, y: (base.y + team.y) / 2 }
}
