// The arena's two teams wear the Clash stage's colours: vermillion and sky blue, as OkLab hues.
import { describe, expect, it } from 'vitest'
import { TEAM_A_HUE, TEAM_B_HUE, teamTintedColor } from './teamTint'

/** The OkLab hue of a transform colour, in degrees. */
const hueOf = (color: { x: number; y: number }) =>
  ((Math.atan2(color.y, color.x) * 180) / Math.PI + 360) % 360

describe('team tint', () => {
  it("puts team A at vermillion #D55E00's hue and team B at sky blue #56B4E9's", () => {
    expect(
      hueOf(teamTintedColor(undefined, TEAM_A_HUE, 'override')),
    ).toBeCloseTo(47.51, 1)
    expect(
      hueOf(teamTintedColor(undefined, TEAM_B_HUE, 'override')),
    ).toBeCloseTo(236.18, 1)
  })

  it('keeps the chroma of the editor colours', () => {
    const { x, y } = teamTintedColor(undefined, TEAM_A_HUE, 'override')
    expect(Math.hypot(x, y)).toBeCloseTo(0.3)
  })
})
