/**
 * The ground a flame's art sits on (backgroundColor.ts): what Flam3 clears
 * the canvas to.
 */
import { describe, expect, it } from 'vitest'
import { flameBackgroundColor } from './backgroundColor'
import type { FlameDescriptor } from './schema/flameSchema'

type RenderSettings = FlameDescriptor['renderSettings']

function settings(overrides: Partial<RenderSettings>): RenderSettings {
  return { drawMode: 'light', ...overrides } as RenderSettings
}

describe('flameBackgroundColor', () => {
  it('is black for light drawing with no colour chosen', () => {
    expect(
      flameBackgroundColor(settings({ backgroundColor: undefined })),
    ).toEqual([0, 0, 0])
  })

  it('is white for paint with no colour chosen', () => {
    expect(
      flameBackgroundColor(
        settings({ drawMode: 'paint', backgroundColor: undefined }),
      ),
    ).toEqual([1, 1, 1])
  })

  it('is the chosen colour as it is, paint or not', () => {
    const chosen: [number, number, number] = [0.2, 0.4, 0.6]
    expect(flameBackgroundColor(settings({ backgroundColor: chosen }))).toEqual(
      chosen,
    )
    expect(
      flameBackgroundColor(
        settings({ drawMode: 'paint', backgroundColor: chosen }),
      ),
    ).toEqual(chosen)
  })
})
