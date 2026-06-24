import { example46 } from '@/flame/examples/example46'
import { applyFlameRecipe } from './flame'
import type { FlameRecipe } from './flame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Earth Flame palette variants for the "Explore Earth Flame" gallery. Each is
 * derived from the shipped example46 (which is the "Sunrise" look) by overriding
 * transform colors / probabilities — same flame structure, just recoloured, so
 * they share one compiled pipeline and can be swapped live without a recompile.
 *
 * Transform order in example46: [0] body (ocean), [1] continents (land),
 * [2] atmospheric glow, [3] starfield. color = OkLab (a = green↔red,
 * b = blue↔yellow). Posters live in public/posters/earth-variants/<id>.jpg.
 */
export type EarthVariant = {
  id: string
  name: string
  tag: string
  flame: FlameDescriptor
  poster: string
}

function variant(
  id: string,
  name: string,
  tag: string,
  recipe: FlameRecipe | null,
): EarthVariant {
  return {
    id,
    name,
    tag,
    flame: recipe ? applyFlameRecipe(example46, recipe) : example46,
    poster: `/posters/earth-variants/${id}.jpg`,
  }
}

export const EARTH_VARIANTS: EarthVariant[] = [
  // The shipped look — example46 as-is.
  variant('sunrise', 'Sunrise', 'warm bloom · deep ocean', null),
  variant('ocean', 'Ocean World', 'deep blue · sparse land', {
    transforms: [
      { color: [-0.25, -0.58] },
      { color: [-0.35, 0.1], probability: 0.18 },
      { color: [-0.05, -0.3], probability: 0.1 },
      {},
    ],
  }),
  variant('trueearth', 'True Earth', 'blue-green · faint rim', {
    transforms: [
      { color: [-0.2, -0.55] },
      { color: [-0.5, 0.3] },
      { color: [0.5, 0.4], probability: 0.1 },
      {},
    ],
  }),
  variant('verdant', 'Verdant', 'lush green world', {
    transforms: [
      { color: [-0.22, -0.45] },
      { color: [-0.55, 0.33], probability: 0.42 },
      { color: [0.4, 0.42], probability: 0.1 },
      {},
    ],
    render: { vibrancy: 1.1 },
  }),
  variant('nebula', 'Nebula', 'cyan glow · dense stars', {
    transforms: [
      { color: [-0.2, -0.5] },
      { color: [-0.4, 0.2] },
      { color: [-0.1, -0.42], probability: 0.22 },
      { color: [-0.05, -0.2], probability: 0.26 },
    ],
    render: { exposure: -0.9 },
  }),
  variant('vivid', 'Vivid', 'saturated · high contrast', {
    transforms: [
      { color: [-0.3, -0.62] },
      { color: [-0.5, 0.34] },
      { color: [0.5, 0.45], probability: 0.12 },
      {},
    ],
    render: { vibrancy: 1.2, contrast: 3.0, gamma: 2.8 },
  }),
]

export const earthVariantById = (id: string): EarthVariant | undefined =>
  EARTH_VARIANTS.find((v) => v.id === id)
