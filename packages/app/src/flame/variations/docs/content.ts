import type { VariationDocMap } from './types'

/**
 * Authored documentation for a starter set of variations. Everything not
 * listed here renders a graceful "not yet documented" state in the modal.
 *
 * Keys are checked against the real variation-type union at compile time, and
 * `params` keys are checked against each variation's `paramStruct` fields by
 * `docs.coverage.test.ts`.
 */
export const variationDocsContent: VariationDocMap = {
  linearVar: {
    summary:
      'The identity transform: the point is passed through unchanged, then scaled by the variation weight. It is the foundation most flames are built on.',
    tex: 'V(x,y) = (x,\\ y)',
  },
  juliaVar: {
    summary:
      'Takes the square root of the radius and halves the angle, then randomly flips by π. This folds the plane onto itself, producing the characteristic Julia-set spirals.',
    tex: 'V = \\sqrt{r}\\left(\\cos\\!\\big(\\tfrac{\\theta}{2}+\\Omega\\big),\\ \\sin\\!\\big(\\tfrac{\\theta}{2}+\\Omega\\big)\\right),\\quad \\Omega\\in\\{0,\\pi\\}',
  },
  horseshoeVar: {
    summary:
      'A radial inversion that stretches the plane into a horseshoe by mixing the squared coordinates. Strongly directional near the origin.',
    tex: 'V = \\tfrac{1}{r}\\big((x-y)(x+y),\\ 2xy\\big)',
  },
  polarVar: {
    summary:
      'Maps Cartesian coordinates to a polar strip: the angle becomes the horizontal axis and the radius (minus one) the vertical axis.',
    tex: 'V = \\big(\\tfrac{\\theta}{\\pi},\\ r-1\\big)',
  },
  discVar: {
    summary:
      'Wraps the plane into concentric rings by swapping radius and angle through a sine/cosine of the radius. Produces a hypnotic disc of ripples.',
    tex: 'V = \\tfrac{\\theta}{\\pi}\\big(\\sin(\\pi r),\\ \\cos(\\pi r)\\big)',
  },
  bubbleVar: {
    summary:
      'An inversion that pushes the whole plane inside a unit disc, as if reflected in a spherical bubble. Distant points cluster near the rim.',
    tex: 'V = \\tfrac{4}{r^{2}+4}\\,(x,\\ y)',
  },
  exponentialVar: {
    summary:
      'Exponentiates the x-coordinate and rotates by π·y, mapping vertical lines to rays and producing exponential, feather-like fans.',
    tex: 'V = e^{\\,x-1}\\big(\\cos(\\pi y),\\ \\sin(\\pi y)\\big)',
  },
  popcornVar: {
    summary:
      'Adds a tangent-of-sine jitter to each coordinate, scattering points into a popped, granular texture. The c and f offsets come from the transform affine.',
    tex: 'V = \\big(x + c\\,\\sin(\\tan 3y),\\ y + f\\,\\sin(\\tan 3x)\\big)',
  },
  bentVar: {
    summary:
      'A piecewise linear bend: the negative-x half is doubled in width and the negative-y half is halved in height, kinking the plane along the axes.',
  },
  augerVar: {
    summary:
      'A self-referential sine fold that ripples the coordinates against their own absolute value, with an optional symmetric second fold. Creates woven, drill-like lattices.',
    params: {
      freq: {
        description: 'Spatial frequency of the sine folding.',
        range: [0, 10],
        valueType: 'float',
      },
      weight: {
        description: 'Strength of the applied fold.',
        range: [0, 2],
        valueType: 'float',
      },
      sym: {
        description:
          'Symmetry mix between the two folding axes (0 = asymmetric).',
        range: [0, 1],
        valueType: 'float',
      },
      scale: {
        description: 'Amplitude of the fold relative to the base coordinate.',
        range: [0, 5],
        valueType: 'float',
      },
    },
  },
  hexesVar: {
    summary:
      'Tiles the plane into hexagonal cells and distorts each cell by a power law, optionally rotated and rescaled. Yields honeycomb-like structures.',
    params: {
      cellsize: {
        description: 'Edge size of each hexagonal cell.',
        range: [0.05, 2],
        valueType: 'float',
      },
      power: {
        description: 'Exponent shaping the per-cell distortion.',
        range: [-5, 5],
        valueType: 'float',
      },
      rotate: {
        description: 'Rotation applied within each cell.',
        valueType: 'angle',
      },
      scale: {
        description: 'Scale of the per-cell output.',
        range: [0, 2],
        valueType: 'float',
      },
    },
  },
  ngonVar: {
    summary:
      'Bends the radius toward a regular polygon, letting you dial the number of sides and corner sharpness, or blend back toward a circle.',
    params: {
      power: {
        description: 'Exponent applied to the radius.',
        range: [-10, 10],
        valueType: 'float',
      },
      sides: {
        description: 'Number of polygon sides.',
        range: [2, 12],
        valueType: 'int',
      },
      corners: {
        description: 'Corner sharpness multiplier.',
        range: [0, 5],
        valueType: 'float',
      },
      circle: {
        description: 'Blend toward a circle (0) versus the polygon.',
        range: [0, 2],
        valueType: 'float',
      },
    },
  },
}
