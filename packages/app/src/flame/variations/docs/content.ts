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

  // --- Classic flam3 variations (formulas per Draves & Reckase, "The Fractal
  // Flame Algorithm"). Ranges/types are derived from the editors, so these only
  // need a summary, the math, and (for parametric ones) parameter prose.
  sinusoidalVar: {
    summary:
      'Applies a sine wave to each coordinate independently, folding the plane into a periodic ripple that tiles softly toward the edges.',
    tex: 'V = (\\sin x,\\ \\sin y)',
  },
  sphericalVar: {
    summary:
      'Inverts the plane through the unit circle (1/r² falloff): points near the origin fly outward and far points collapse inward, the classic lens warp.',
    tex: 'V = \\tfrac{1}{r^{2}}\\,(x,\\ y)',
  },
  swirlVar: {
    summary:
      'Rotates each point by an angle that grows with r², winding the plane into a tightening spiral vortex.',
    tex: 'V = \\big(x\\sin r^{2} - y\\cos r^{2},\\ \\ x\\cos r^{2} + y\\sin r^{2}\\big)',
  },
  handkerchiefVar: {
    summary:
      'A polar fold where the radius modulates the angle, draping the plane into soft folded-cloth ripples.',
    tex: 'V = r\\big(\\sin(\\theta + r),\\ \\cos(\\theta - r)\\big)',
  },
  heartVar: {
    summary:
      'Twists the angle in proportion to the radius, curling the plane into nested heart / scroll shapes.',
    tex: 'V = r\\big(\\sin(r\\theta),\\ -\\cos(r\\theta)\\big)',
  },
  spiralVar: {
    summary:
      'Combines an inverse-radius scaling with sine/cosine of the radius to wind points into an open logarithmic spiral.',
    tex: 'V = \\tfrac{1}{r}\\big(\\cos\\theta + \\sin r,\\ \\ \\sin\\theta - \\cos r\\big)',
  },
  hyperbolicVar: {
    summary:
      'Pushes the angle and radius in opposite directions (sinθ/r horizontally, r·cosθ vertically), producing hyperbolic sheets.',
    tex: 'V = \\big(\\tfrac{\\sin\\theta}{r},\\ \\ r\\cos\\theta\\big)',
  },
  diamondVar: {
    summary:
      'Multiplies angular and radial sinusoids, tiling the plane into a lattice of diamond cells.',
    tex: 'V = (\\sin\\theta\\,\\cos r,\\ \\ \\cos\\theta\\,\\sin r)',
  },
  exVar: {
    summary:
      'Cubes two radius-dependent sinusoids and sums/differences them, blooming the plane into petal-like lobes.',
    tex: 'p_0 = \\sin(\\theta + r),\\ \\ p_1 = \\cos(\\theta - r);\\quad V = r\\big(p_0^{3} + p_1^{3},\\ \\ p_0^{3} - p_1^{3}\\big)',
  },
  fisheyeVar: {
    summary:
      'A bulging radial magnification (2/(r+1)) that also swaps the axes — the centre balloons outward like a fisheye lens.',
    tex: 'V = \\tfrac{2}{r+1}\\,(y,\\ x)',
  },
  eyefishVar: {
    summary:
      'The same 2/(r+1) radial bulge as fisheye but without the axis swap, magnifying the centre symmetrically.',
    tex: 'V = \\tfrac{2}{r+1}\\,(x,\\ y)',
  },
  powerVar: {
    summary:
      'Raises the radius to a sine-of-angle power and re-projects along the angle, sweeping points into feathered power-curve plumes.',
    tex: 'V = r^{\\,\\sin\\theta}\\,(\\cos\\theta,\\ \\sin\\theta)',
  },
  cosineVar: {
    summary:
      'Treats the point as a complex number and takes its cosine, mixing trigonometric and hyperbolic terms into rippled columns.',
    tex: 'V = \\big(\\cos(\\pi x)\\cosh y,\\ \\ -\\sin(\\pi x)\\sinh y\\big)',
  },
  cylinderVar: {
    summary:
      'Wraps the x-axis through a sine while leaving y untouched, rolling the plane onto a vertical cylinder.',
    tex: 'V = (\\sin x,\\ y)',
  },
  tangentVar: {
    summary:
      'Divides a sine of x by a cosine of y and takes the tangent of y, shearing the plane into tangent fans that blow up near the asymptotes.',
    tex: 'V = \\big(\\tfrac{\\sin x}{\\cos y},\\ \\ \\tan y\\big)',
  },
  crossVar: {
    summary:
      'Scales by the inverse of |x²−y²|, carving the plane along its diagonals into a sharp four-armed cross.',
    tex: 'V = \\sqrt{\\dfrac{1}{(x^{2} - y^{2})^{2}}}\\;(x,\\ y)',
  },
  expVar: {
    summary:
      'Exponentiates x and rotates by y (the complex exponential), mapping vertical lines to rays for exponential plumes.',
    tex: 'V = e^{x}\\,(\\cos y,\\ \\sin y)',
  },
  blurVar: {
    summary:
      'Ignores the input and scatters points uniformly within a disc — a pure radial blur used to soften or seed a flame.',
    tex: 'V = \\xi_1\\big(\\cos(2\\pi\\xi_2),\\ \\sin(2\\pi\\xi_2)\\big),\\quad \\xi_i \\sim U(0,1)',
  },
  squareVar: {
    summary:
      'Ignores the input and fills a unit square with uniform random points — a flat blur for backgrounds and texture.',
    tex: 'V = \\big(\\xi_1 - \\tfrac12,\\ \\xi_2 - \\tfrac12\\big),\\quad \\xi_i \\sim U(0,1)',
  },
  pdjVar: {
    summary:
      'The Peter de Jong attractor map: four independent sine/cosine couplings of x and y that fold the plane into intricate woven curves.',
    tex: 'V = \\big(\\sin(a\\,y) - \\cos(b\\,x),\\ \\ \\sin(c\\,x) - \\cos(d\\,y)\\big)',
    params: {
      a: { description: 'Frequency of the sine term in x driven by y.' },
      b: { description: 'Frequency of the cosine term in x driven by x.' },
      c: { description: 'Frequency of the sine term in y driven by x.' },
      d: { description: 'Frequency of the cosine term in y driven by y.' },
    },
  },
  blobVar: {
    summary:
      'Modulates the radius by an angular sine wave, pushing the circle out to "high" at the crests and in to "low" at the troughs — a lobed blob.',
    tex: 'V = r\\Big(\\text{low} + \\tfrac{\\text{high}-\\text{low}}{2}\\big(\\sin(\\text{waves}\\,\\theta) + 1\\big)\\Big)(\\cos\\theta,\\ \\sin\\theta)',
    params: {
      high: { description: 'Outer radius reached at each wave crest.' },
      low: { description: 'Inner radius reached at each wave trough.' },
      waves: { description: 'Number of lobes around the circle.' },
    },
  },
  juliaNVar: {
    summary:
      'A generalized Julia map: the angle is split into N branches chosen at random and the radius is raised to a dist/N power, fanning out N-fold symmetric spirals.',
    tex: 't = \\dfrac{\\theta + 2\\pi\\lfloor |N|\\,\\xi\\rfloor}{N};\\quad V = r^{\\,\\text{dist}/N}(\\cos t,\\ \\sin t),\\quad \\xi \\sim U(0,1)',
    params: {
      power: {
        description:
          'Number of branches N — how many symmetric copies the plane folds into.',
      },
      dist: {
        description:
          'Radial exponent (dist/N): how far each branch reaches from the centre.',
      },
    },
  },
  juliaScopeVar: {
    summary:
      'Like juliaN, but every other branch is mirror-reflected — producing kaleidoscopic, symmetric spiral fans instead of plain rotational copies.',
    params: {
      power: { description: 'Number of branches the plane folds into.' },
      dist: {
        description:
          'Radial exponent (dist/power): how far each branch reaches.',
      },
    },
  },

  // --- Second batch: common parametric variations (math from the app's own
  // implementation; parameter names confirmed against the JWildfire spreadsheet).
  curlVar: {
    summary:
      'A complex curl: maps the point through a quadratic in two coefficients and divides by its squared magnitude, twisting straight lines into curls and scrolls.',
    tex: 't_1 = 1 + c_1 x + c_2(x^{2}-y^{2}),\\quad t_2 = c_1 y + 2c_2 xy;\\quad V = \\dfrac{(x\\,t_1 + y\\,t_2,\\ \\ y\\,t_1 - x\\,t_2)}{t_1^{2} + t_2^{2}}',
    params: {
      c1: { description: 'Linear curl coefficient (shear along x).' },
      c2: { description: 'Quadratic curl coefficient (the curling strength).' },
    },
  },
  pieVar: {
    summary:
      'Slices the plane into angular wedges and scatters points within a chosen slice, fanning the flame into a pie of radial segments.',
    params: {
      slices: { description: 'Number of pie slices the circle is cut into.' },
      rotation: { description: 'Angular offset of the whole pie.' },
      thickness: {
        description: 'Spread of points within each slice (0–1 of its width).',
      },
    },
  },
  cellVar: {
    summary:
      'Partitions the plane into square cells of a fixed size and re-stacks them in an interleaved fan-out, shattering the image into a shuffled grid.',
    params: {
      size: { description: 'Edge length of each square cell.' },
    },
  },
  fan2Var: {
    summary:
      'An angular fan: points are folded into wedges of width π·x² and the split is rotated by y, sweeping the plane into a folding fan.',
    params: {
      x: { description: 'Wedge width, applied as π·x².' },
      y: { description: 'Rotational offset of the fan split.' },
    },
  },
  rings2Var: {
    summary:
      'Quantizes the radius into concentric rings spaced by the val parameter, snapping points onto evenly-spaced shells.',
    tex: 't = r - 2p\\Big\\lfloor \\tfrac{r+p}{2p} \\Big\\rfloor + r(1-p),\\ \\ p = \\text{val};\\quad V = t\\,(\\sin\\theta,\\ \\cos\\theta)',
    params: {
      val: { description: 'Spacing between successive rings.' },
    },
  },
  cpowVar: {
    summary:
      'Complex power: raises the point (as a complex number) to a complex exponent, generating families of logarithmic spirals with branch symmetry.',
    params: {
      r: { description: 'Real part of the complex exponent.' },
      i: { description: 'Imaginary part of the complex exponent.' },
      power: { description: 'Number of rotational branches.' },
    },
  },
  bipolarVar: {
    summary:
      'Re-expresses the plane in bipolar coordinates, wrapping it into two stereographic lobes; the shift slides the projection pole vertically.',
    params: {
      shift: {
        description: 'Vertical shift of the bipolar pole (in units of π/2).',
      },
    },
  },
  popcorn2Var: {
    summary:
      'A generalized popcorn jitter: adds sin(tan(·)) displacements with independent x/y amounts and a shared frequency, scattering points into a granular, popped texture.',
    tex: 'V = \\big(x + p_x\\sin(\\tan(c\\,y)),\\ \\ y + p_y\\sin(\\tan(c\\,x))\\big)',
    params: {
      x: { description: 'Horizontal jitter amount (pₓ in the formula).' },
      y: { description: 'Vertical jitter amount (p_y in the formula).' },
      c: { description: 'Frequency of the tangent folding.' },
    },
  },
}
