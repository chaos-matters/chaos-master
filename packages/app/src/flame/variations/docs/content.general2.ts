import type { VariationDocMap } from './types'

/**
 * Second batch of "general" group parametric variations. Drafted from each
 * variation's implementation; maps relying on random()/iteration/long blends
 * are described qualitatively without a `tex`. Keys + param keys validated
 * against the registry by docs.coverage.test.
 */
export const variationDocsGeneral2: VariationDocMap = {
  whorlVar: {
    summary:
      'Adds a radius-dependent angular offset to each point, using one offset inside the unit-weight circle and another outside, producing a swirling whorl.',
    tex: 'V = w\\,r\\,(\\cos a, \\sin a),\\ a = \\theta + \\tfrac{p}{w - r}',
    params: {
      inside: {
        description:
          'Angular twist strength applied when the point radius is inside the weight circle (r < w).',
      },
      outside: {
        description:
          'Angular twist strength applied when the point radius is outside the weight circle (r >= w).',
      },
    },
  },
  stripfitVar: {
    summary:
      'Folds the plane into horizontal strips of height two, snapping y into the nearest strip and shifting x proportionally to the strip offset, leaving the central band unchanged.',
    params: {
      dx: {
        description:
          'Horizontal shear applied per strip; scales how far x is displaced based on the folded y distance.',
      },
    },
  },
  lissajousVar: {
    summary:
      'Generates a Lissajous curve by sampling a random parameter t over a range, with an added cross-term that jitters the curve along a random offset.',
    params: {
      tmin: { description: 'Lower bound of the random parameter t range.' },
      tmax: { description: 'Upper bound of the random parameter t range.' },
      a: { description: 'Frequency multiplier of t for the x sine component.' },
      b: { description: 'Frequency multiplier of t for the y sine component.' },
      c: {
        description:
          'Scales the t term added uniformly to both output coordinates.',
      },
      d: { description: 'Phase offset added inside the x sine component.' },
      e: {
        description:
          'Scales the random y jitter added uniformly to both output coordinates.',
      },
    },
  },
  yinYangVar: {
    summary:
      'Rotates the input by angle one, applies a circle-inversion-style transform scaled by radius, then rotates by angle two, optionally negating and choosing inside or outside behavior to form a yin-yang pattern.',
    params: {
      radius: {
        description:
          'Radius of the inversion circle that controls the curvature of the mapping.',
      },
      ang1: {
        description:
          'Initial rotation angle factor (multiplied by pi) applied before the inversion.',
      },
      ang2: {
        description:
          'Final rotation angle factor (multiplied by pi) added after the inversion.',
      },
      dual_t: {
        description:
          'Scales the inversion parameter t, doubling or canceling the dual lobe effect.',
      },
      outside: {
        description:
          'Switch selecting whether the inversion parameter is used positive or negated (inside vs outside lobe).',
      },
    },
  },
  sphericalNVar: {
    summary:
      'A spherical inversion variant that splits output across power-many angular sectors, choosing a random sector and raising the radius to an adjustable distance power.',
    tex: 'V = \\tfrac{w}{r}(\\cos\\alpha, \\sin\\alpha),\\ \\alpha = \\theta + \\tfrac{2\\pi n}{power},\\ r = (\\sqrt{x^2+y^2})^{dist}',
    params: {
      power: {
        description:
          'Number of angular sectors; a random sector index from zero to power-one rotates the point.',
      },
      dist: {
        description:
          'Exponent applied to the radius before inversion, controlling radial falloff.',
      },
    },
  },
  seaShellVar: {
    summary:
      'Maps x to an angle spanning a number of turns and grows the radius exponentially with that angle, tracing a logarithmic-spiral seashell with a vertically compressed y axis.',
    tex: 'V = w\\,(r\\cos t, 0.6\\,r\\sin t),\\ t = (x+1)\\,turns\\,\\pi,\\ r = e^{tightness\\,t}',
    params: {
      turns: {
        description:
          'Number of spiral turns the x coordinate is mapped across.',
      },
      tightness: {
        description:
          'Exponential growth rate of the spiral radius, setting how tightly the shell coils.',
      },
    },
  },
  rectanglesVar: {
    summary:
      'Tiles the plane into a grid of rectangles and reflects each point about the center of its cell, producing a repeating rectangular mirror pattern.',
    tex: 'V = w\\,((2\\lfloor x/x_0\\rfloor + 1)x_0 - x,\\ (2\\lfloor y/y_0\\rfloor + 1)y_0 - y)',
    params: {
      x: { description: 'Width of each rectangular cell along the x axis.' },
      y: { description: 'Height of each rectangular cell along the y axis.' },
    },
  },
  roseVar: {
    summary:
      'Draws a rose (rhodonea) curve whose petal count depends on the ratio of n to d, using x as the angle parameter.',
    tex: 'V = w\\,(r\\cos\\theta, r\\sin\\theta),\\ r = \\cos(\\tfrac{n}{d}\\theta),\\ \\theta = x\\pi',
    params: {
      n: { description: 'Numerator of the petal frequency ratio k = n/d.' },
      d: { description: 'Denominator of the petal frequency ratio k = n/d.' },
    },
  },
  spirographVar: {
    summary:
      'Plots a spirograph (epicycloid-style) curve from random parameters t and y, combining two rotating components with adjustable amplitudes and a drift offset.',
    params: {
      a: {
        description:
          'Fixed-circle radius contributing to the main rotation amplitude (a+b).',
      },
      b: {
        description:
          'Rolling-circle radius affecting both the amplitude and the inner frequency ((a+b)/b).',
      },
      d: {
        description:
          'Amplitude of an extra rotating offset added along cosine and sine of t.',
      },
      tmin: { description: 'Lower bound of the random angle parameter t.' },
      tmax: { description: 'Upper bound of the random angle parameter t.' },
      ymin: {
        description:
          'Lower bound of the random drift value y added to both coordinates.',
      },
      ymax: {
        description:
          'Upper bound of the random drift value y added to both coordinates.',
      },
      c1: {
        description:
          'Amplitude of the inner cosine term subtracted from the x component.',
      },
      c2: {
        description:
          'Amplitude of the inner sine term subtracted from the y component.',
      },
    },
  },
  sineBlurVar: {
    summary:
      'A radial blur that scatters points around their position at a random angle, with a random radius distribution whose shape is controlled by power.',
    params: {
      power: {
        description:
          'Controls the random radius distribution; at one it is an arccosine spread, otherwise an exponential-log distribution biased by the power.',
      },
    },
  },
  mobiusVar: {
    summary:
      'Applies a Mobius transformation in the complex plane, mapping the point z to (az + b) / (cz + d) with a small denominator guard.',
    params: {
      a: {
        description:
          'Real coefficient a in the Mobius numerator az + b (used as the diagonal of the complex linear part).',
      },
      b: {
        description: 'Real translation term b added in the Mobius numerator.',
      },
      c: {
        description:
          'Real coefficient c forming the off-diagonal and denominator terms of the transform.',
      },
      d: {
        description: 'Real coefficient d in the Mobius denominator cz + d.',
      },
    },
  },
  shredradVar: {
    summary:
      'Divides the plane into n angular wedges and shreds each wedge by compressing the angle within it toward the wedge boundary, controlled by width.',
    params: {
      n: {
        description: 'Number of angular wedges the circle is divided into.',
      },
      width: {
        description:
          'Fraction by which each wedge angle is compressed; larger magnitude shreds the wedge more tightly.',
      },
    },
  },
  taurusVar: {
    summary:
      'Wraps points onto a torus-like ring whose radius is modulated by a cosine of n times x, with a sine offset along a scaled y direction.',
    tex: 'V = w\\,(\\cos x\\,(ir + \\sin(y\\,sor)),\\ \\sin x\\,(ir + \\sin(y\\,sor))),\\ ir = inv\\,r + (1-inv)\\,r\\cos(n x)',
    params: {
      r: { description: 'Base ring radius of the torus.' },
      n: {
        description:
          'Number of radial ripples; frequency of the cosine modulating the ring radius.',
      },
      inv: {
        description:
          'Blend between a constant radius and the cosine-modulated radius (an inversion or ripple amount).',
      },
      sor: {
        description:
          'Frequency scaling of y inside the sine offset added to the ring radius.',
      },
    },
  },
  waves2Var: {
    summary:
      'Displaces each coordinate by a sine wave of the other coordinate, giving independent horizontal and vertical wave distortions.',
    tex: 'V = w\\,(x + scaleX\\,\\sin(y\\,freqX),\\ y + scaleY\\,\\sin(x\\,freqY))',
    params: {
      scaleX: { description: 'Amplitude of the x displacement wave.' },
      scaleY: { description: 'Amplitude of the y displacement wave.' },
      freqX: {
        description: 'Frequency of the sine of y driving the x displacement.',
      },
      freqY: {
        description: 'Frequency of the sine of x driving the y displacement.',
      },
    },
  },
  splitVar: {
    summary:
      'Splits the plane by flipping the sign of each coordinate based on the sign of a cosine of that coordinate, creating alternating mirrored bands.',
    params: {
      xSize: {
        description:
          'Frequency of the cosine test along x that decides whether x is reflected.',
      },
      ySize: {
        description:
          'Frequency of the cosine test along y that decides whether y is reflected.',
      },
    },
  },
  juliaOutsideVar: {
    summary:
      'A Julia-style complex map that combines square roots and squarings of z and z-related terms, divides them, then divides by a complex constant, with three selectable modes and a random sign flip.',
    params: {
      reDiv: {
        description:
          'Real part of the complex constant the result is divided by at the end.',
      },
      imDiv: {
        description:
          'Imaginary part of the complex constant the result is divided by at the end.',
      },
      mode: {
        description:
          'Selects among three behavior modes (zero, one, or two) that toggle which square-root, square, and sign-flip steps are applied.',
      },
    },
  },
  loziVar: {
    summary:
      'Applies the Lozi map, a piecewise-linear chaotic attractor using the absolute value of x.',
    tex: 'V = w\\,(1 - a\\,|x| + y,\\ b\\,x)',
    params: {
      a: {
        description:
          'Coefficient on the absolute value of x in the x update; main nonlinearity strength.',
      },
      b: { description: 'Scaling of x carried into the new y coordinate.' },
    },
  },
  onionVar: {
    summary:
      'Performs a radial circle inversion about an adjustable center, mapping points to concentric onion-like shells depending on whether they fall inside or outside a radius derived from the weight.',
    params: {
      centre_x: {
        description:
          'X coordinate of the inversion center, subtracted before and added back after the transform.',
      },
      centre_y: {
        description:
          'Y coordinate of the inversion center, subtracted before and added back after the transform.',
      },
    },
  },
  separationVar: {
    summary:
      'Pushes each coordinate away from the axis using a hyperbola-like square root with a separation gap, then nudges it back inward by an inside factor, with the direction set by the coordinate sign.',
    params: {
      xSep: {
        description:
          'Separation gap along x; its square sets the offset that splits points away from the y axis.',
      },
      xInside: {
        description:
          'Inward correction factor along x that pulls points back toward the axis.',
      },
      ySep: {
        description:
          'Separation gap along y; its square sets the offset that splits points away from the x axis.',
      },
      yInside: {
        description:
          'Inward correction factor along y that pulls points back toward the axis.',
      },
    },
  },
  spligonVar: {
    summary:
      'Quantizes the point angle into a fixed number of sides and offsets the point along the resulting polygonal direction by a radius, forming a polygon-like splatter.',
    params: {
      sides: {
        description:
          'Number of polygon sides; the angle is quantized into this many sectors.',
      },
      r: {
        description:
          'Radial offset distance added along the quantized polygon direction.',
      },
      i: {
        description:
          'Index that shifts the angular phase of the polygon orientation.',
      },
    },
  },
  perlinNoiseVar: {
    summary:
      'Offsets each point by fractal Perlin noise sampled over several octaves, accumulating layers of increasing frequency and decreasing amplitude.',
    params: {
      octaves: {
        description:
          'Number of noise layers summed; more octaves add finer detail.',
      },
      persistance: {
        description:
          'Amplitude multiplier between successive octaves, controlling how quickly higher octaves fade.',
      },
      lacunarity: {
        description:
          'Frequency multiplier between successive octaves, controlling detail spacing.',
      },
    },
  },
  plusRecipVar: {
    summary:
      'A complex map that squares z, subtracts a complex constant a, takes a square root, adds z, squares again, then conditionally reflects via the conjugate of a when the magnitude is small, ensuring a non-negative real part.',
    params: {
      ar: {
        description:
          'Real part of the complex constant a subtracted and used in the conditional conjugate reflection.',
      },
      ai: {
        description:
          'Imaginary part of the complex constant a subtracted and used in the conditional conjugate reflection.',
      },
    },
  },
  sattractorVar: {
    summary:
      'A symmetric attractor that picks one of m rotation angles at random and applies, with equal probability, either a scaled-and-shifted copy or a quadratic rotation map.',
    params: {
      m: {
        description:
          'Number of symmetry folds; sets how many discrete rotation angles are chosen from.',
      },
    },
  },
  linearTVar: {
    summary:
      'Raises the absolute value of each coordinate to its own power while preserving the original sign, giving an odd power-law warp per axis.',
    tex: 'V = w\\,(\\operatorname{sign}(x)\\,|x|^{powX},\\ \\operatorname{sign}(y)\\,|y|^{powY})',
    params: {
      powX: { description: 'Exponent applied to the magnitude of x.' },
      powY: { description: 'Exponent applied to the magnitude of y.' },
    },
  },
  splitBrdrVar: {
    summary:
      'A bubble-warped split-border variation that snaps points into integer cells and, with random branch selection, either mildly centers them or pushes them toward the dominant cell edge, plus a linear post-add.',
    params: {
      x: {
        description:
          'Positive-side border push distance controlling how far points move toward the positive cell edge.',
      },
      y: {
        description:
          'Negative-side border push distance controlling how far points move toward the negative cell edge.',
      },
      px: {
        description:
          'Linear post-add coefficient scaling x added to the final output.',
      },
      py: {
        description:
          'Linear post-add coefficient scaling y added to the final output.',
      },
    },
  },
  tradeVar: {
    summary:
      'Exchanges points between two adjacent circles; points inside the right circle are mapped into the left circle and vice versa, while points outside both pass through unchanged.',
    params: {
      r1: { description: 'Radius of the first (right-side) circle.' },
      d1: {
        description:
          'Gap distance for the first circle, added to r1 to set its center offset.',
      },
      r2: { description: 'Radius of the second (left-side) circle.' },
      d2: {
        description:
          'Gap distance for the second circle, added to r2 to set its center offset.',
      },
    },
  },
  rsquaresVar: {
    summary:
      'Tiles the plane into a grid of square cells and re-centers each cell, offsetting horizontally by a per-quadrant amount to create rows of repeated square panels.',
    params: {
      depth: {
        description:
          'Nominal recursion depth control for the squares tiling. Higher values are intended to produce finer subdivisions.',
      },
      scale: {
        description:
          'Divides the within-cell offset, controlling how tightly each square cell is packed and scaled.',
      },
    },
  },
  squircularVar: {
    summary:
      'Maps the point through a squircle-like radial transform, blending between circular and square output shapes based on the parameter.',
    params: {
      n: {
        description:
          'Controls the squircle softening: larger values push the shape toward a circle, smaller values toward a square.',
      },
    },
  },
  sigmoidVar: {
    summary:
      'Passes each coordinate through a logistic sigmoid with separate horizontal and vertical steepness, remapping the output to a centered range. Steepness values between minus one and one are inverted to extend the usable scale.',
    params: {
      shiftx: {
        description:
          'Horizontal steepness of the sigmoid; values inside the open interval from minus one to one are reciprocated and sign-flipped to spread the effect.',
      },
      shifty: {
        description:
          'Vertical steepness of the sigmoid, handled the same way as the horizontal one.',
      },
    },
  },
  loonie2Var: {
    summary:
      'A polygonal generalization of the loonie variation that folds the point across a number of symmetry sides and warps the radius, blending star and circle shaping before applying a square-root reciprocal radius.',
    params: {
      sides: {
        description:
          'Number of rotational symmetry sides used when folding the point around the origin.',
      },
      star: {
        description:
          'Star-point sharpening factor that skews the half-plane fold toward pointed lobes.',
      },
      circle: {
        description:
          'Blends the folded polygonal radius back toward the circular radius, rounding the shape.',
      },
    },
  },
  shiftVar: {
    summary:
      'Translates the point by a fixed offset that is first rotated by the given angle, shifting the input in a chosen direction.',
    tex: 'V = (x + \\cos\\theta \\cdot s_x - \\sin\\theta \\cdot s_y,\\ y - \\cos\\theta \\cdot s_y - \\sin\\theta \\cdot s_x)',
    params: {
      shift_x: {
        description:
          'Horizontal component of the translation offset before rotation.',
      },
      shift_y: {
        description:
          'Vertical component of the translation offset before rotation.',
      },
      angle: {
        description:
          'Rotation angle in degrees applied to the offset vector before it is added.',
      },
    },
  },
  vogelVar: {
    summary:
      'Snaps points onto a Vogel phyllotaxis spiral by quantizing the input radius into an index and placing it at the golden-angle position for that index, producing sunflower-seed style patterns.',
    params: {
      scale: {
        description:
          'Overall radial scale of the spiral, multiplying the square-root growth of each seed ring.',
      },
      n: {
        description:
          'Number of points across the spiral, controlling how finely the input radius is quantized into seed indices.',
      },
    },
  },
  pressureWaveVar: {
    summary:
      'Adds a sinusoidal ripple to each coordinate independently, with the amplitude inversely tied to the chosen frequency so higher frequencies make smaller waves.',
    tex: 'V = (x + \\frac{\\sin(p_x x)}{|p_x|},\\ y + \\frac{\\sin(p_y y)}{|p_y|})',
    params: {
      xFreq: {
        description:
          'Frequency of the horizontal ripple; near-zero values disable the horizontal wave.',
      },
      yFreq: {
        description:
          'Frequency of the vertical ripple; near-zero values disable the vertical wave.',
      },
    },
  },
  svenssonVar: {
    summary:
      'Applies the Svensson strange-attractor map, computing new coordinates from sines and cosines of the scaled input, producing organic attractor shapes.',
    tex: 'V = (d\\sin(a x) - \\sin(b y),\\ c\\cos(a x) + \\cos(b y))',
    params: {
      a: {
        description:
          'Frequency coefficient applied to x inside both the sine and cosine terms.',
      },
      b: {
        description:
          'Frequency coefficient applied to y inside both the sine and cosine terms.',
      },
      c: {
        description:
          'Amplitude of the cosine of the scaled x in the output y coordinate.',
      },
      d: {
        description:
          'Amplitude of the sine of the scaled x in the output x coordinate.',
      },
    },
  },
  wallPaperVar: {
    summary:
      'A randomized two-branch map after the Martin wallpaper attractor: half the time it folds the point using a signed square root and swaps coordinates, otherwise it leaves the point unchanged.',
    params: {
      a: {
        description:
          'Offset subtracted from x to form the new y coordinate in the folding branch.',
      },
      b: { description: 'Scale on x inside the signed square-root fold.' },
      c_: {
        description:
          'Constant subtracted before the signed square root, shifting the fold threshold.',
      },
    },
  },
  joukowskiVar: {
    summary:
      'Applies a Joukowski-style conformal transform that maps the input through an airfoil-like mapping, with a thickness parameter shifting and scaling the result.',
    params: {
      thickness: {
        description:
          'Controls the airfoil thickness by setting both the horizontal pre-shift and the squared scale used in the Joukowski reciprocal terms.',
      },
    },
  },
  projectiveVar: {
    summary:
      'Applies a general projective (homographic) transform of the point, dividing an affine numerator by a linear denominator to produce perspective-like warps.',
    tex: 'V = (\\frac{a x + b y + c}{g x + h y + 1},\\ \\frac{d x + e y + f}{g x + h y + 1})',
    params: {
      a: {
        description:
          'Coefficient of x in the numerator of the output x coordinate.',
      },
      b: {
        description:
          'Coefficient of y in the numerator of the output x coordinate.',
      },
      c: {
        description:
          'Constant term in the numerator of the output x coordinate.',
      },
      d: {
        description:
          'Coefficient of x in the numerator of the output y coordinate.',
      },
      e: {
        description:
          'Coefficient of y in the numerator of the output y coordinate.',
      },
      f: {
        description:
          'Constant term in the numerator of the output y coordinate.',
      },
      g: {
        description: 'Coefficient of x in the shared projective denominator.',
      },
      h: {
        description: 'Coefficient of y in the shared projective denominator.',
      },
    },
  },
  lazySensenVar: {
    summary:
      'Partitions the plane into a grid and mirrors the point across cell boundaries in an alternating checkerboard fashion, flipping x and y independently per cell parity to create a kaleidoscopic tiling.',
    params: {
      scale_x: {
        description:
          'Horizontal grid frequency that sets how wide each mirrored cell is along x.',
      },
      scale_y: {
        description:
          'Vertical grid frequency that sets how tall each mirrored cell is along y.',
      },
    },
  },
  squirrelVar: {
    summary:
      'Combines a radial quadratic form with tangent terms, producing swirling squirrel-like patterns from the cosine and sine of a square-rooted weighted radius times the tangent of each coordinate.',
    tex: 'V = (\\cos(\\sqrt{u})\\tan x,\\ \\sin(\\sqrt{u})\\tan y),\\ u = a x^2 + b y^2',
    params: {
      a: {
        description:
          'Weight on the x squared term inside the radial quadratic form.',
      },
      b: {
        description:
          'Weight on the y squared term inside the radial quadratic form.',
      },
    },
  },
  juliaQVar: {
    summary:
      'A generalized Julia set map that raises the radius to a rational power and rotates the angle by a randomly chosen branch, yielding rotationally symmetric fractal copies.',
    params: {
      power: {
        description:
          'Integer numerator-side exponent controlling the rotational symmetry order and the number of random angular branches.',
      },
      divisor: {
        description:
          'Integer divisor that combines with the power to set the fractional exponent applied to radius and angle.',
      },
    },
  },
  woggleVar: {
    summary:
      'Randomly picks one of several evenly spaced rotation angles, rotates and shrinks the point by the reciprocal count, then offsets it, producing a self-similar contractive set.',
    params: {
      m: {
        description:
          'Number of discrete rotation branches; also the reciprocal scale factor applied to the rotated point.',
      },
    },
  },
  shreddedVar: {
    summary:
      'Shreds the plane into strips by quantizing one coordinate and modulating with sine or cosine waves, with three shred type modes and an optional random blur for softened edges.',
    params: {
      x1: {
        description:
          'Frequency of the sine wave used in the horizontal shredding term.',
      },
      x2: {
        description:
          'Scale applied before flooring the input to form the horizontal strip steps.',
      },
      x3: {
        description:
          'Amplitude of the horizontal shred contribution to the output.',
      },
      y1: {
        description:
          'Frequency of the cosine wave used in the vertical shredding term.',
      },
      y2: {
        description:
          'Scale applied before flooring the input to form the vertical strip steps.',
      },
      y3: {
        description:
          'Amplitude of the vertical shred contribution to the output.',
      },
      shredType: {
        description:
          'Selects among three shredding formulas (0, 1, or 2) that differ in which coordinate the strips multiply against.',
      },
      blur: {
        description:
          'Toggle that enables the random edge blur when above one half.',
      },
      xBlur: {
        description:
          'Amplitude of the random horizontal blur jitter added when blur is enabled.',
      },
      yBlur: {
        description:
          'Amplitude of the random vertical blur jitter added when blur is enabled.',
      },
    },
  },
  triangleVar: {
    summary:
      'Discards the input position and instead returns a uniformly random point inside the triangle defined by three vertices, using barycentric sampling.',
    params: {
      x1: { description: 'X coordinate of the first triangle vertex.' },
      y1: { description: 'Y coordinate of the first triangle vertex.' },
      x2: { description: 'X coordinate of the second triangle vertex.' },
      y2: { description: 'Y coordinate of the second triangle vertex.' },
      x3: { description: 'X coordinate of the third triangle vertex.' },
      y3: { description: 'Y coordinate of the third triangle vertex.' },
    },
  },
  kaplanVar: {
    summary:
      'Generates a randomized bit-pattern texture by sampling a grid cell, transforming it through a rotation and a floating-point mantissa parity test, and either showing or hiding the cell based on the resulting sign.',
    params: {
      seed: {
        description:
          'Seed value influencing the pseudo-random pattern (not exposed in the editor).',
      },
      n: {
        description:
          'Grid resolution controlling how finely the plane is sampled into cells.',
      },
      time: {
        description:
          'Zoom factor applied to the cell coordinates before the bit-pattern computation.',
      },
      invert: {
        description:
          'Toggle that inverts which sign of the mantissa parity is treated as visible.',
      },
    },
  },
  sTwinVar: {
    summary:
      'Treats the scaled point as a complex number and squares it, modulating the real and imaginary parts by a sine and cosine of a distortion phase to create twisted twin lobes.',
    params: {
      distort: {
        description:
          'Controls the distortion phase frequency that drives the sine and cosine modulation of the squared complex value.',
      },
      offset_x2: {
        description:
          'Small offset added to the squared x term before differencing.',
      },
      offset_y2: {
        description:
          'Small offset added to the squared y term before differencing.',
      },
      offset_xy: {
        description:
          'Offset added to the combined coordinate sum inside the distortion phase.',
      },
    },
  },
  lazySusanVar: {
    summary:
      'Spins points inside a disk of the weight radius with a twist that increases toward the center, while points outside the disk are pushed radially outward, all around a movable center.',
    params: {
      space: {
        description:
          'Radial spacing applied to points outside the spin disk, pushing them outward.',
      },
      twist: {
        description:
          'Amount of additional rotation that scales with distance from the disk edge, twisting the interior.',
      },
      spin: {
        description: 'Base rotation angle applied to all interior points.',
      },
      x: { description: 'Horizontal coordinate of the spin center.' },
      y: { description: 'Vertical coordinate of the spin center.' },
    },
  },
  parabolaVar: {
    summary:
      'Maps the input radius through sine-squared and cosine terms scaled by height and width, with random multipliers giving a scattered parabolic blur.',
    params: {
      width: {
        description:
          'Scale applied to the cosine of the radius forming the output x coordinate.',
      },
      height: {
        description:
          'Scale applied to the sine-squared of the radius forming the output y coordinate.',
      },
    },
  },
  nPolarVar: {
    summary:
      'A power-of-n polar map that takes a fractional power of the squared distance and divides the angle by n with a random rotational branch, optionally swapping into an alternate parity form.',
    params: {
      n: {
        description:
          'Order of the polar power map, controlling rotational symmetry and the fractional exponent on the radius.',
      },
      parity: {
        description:
          'Parity selector whose oddness switches between the logarithmic-polar input form and a direct coordinate form, also swapping output axes.',
      },
    },
  },
  xheartVar: {
    summary:
      'Produces heart-shaped output by scaling the coordinates with a reciprocal of a shifted squared radius, rotating by an angle, and mirroring the y coordinate based on the sign of the resulting x.',
    params: {
      angle: {
        description:
          'Rotation angle applied to the scaled coordinates before the mirror step.',
      },
      ratio: {
        description:
          'Sets the vertical scaling relative to the fixed horizontal scaling, controlling the heart aspect.',
      },
    },
  },
  sintrangeVar: {
    summary:
      'Modulates each coordinate by its own sine and a term combining its square with the parameter minus the weighted squared radius, creating range-bounded sinusoidal ripples.',
    tex: 'V = (\\sin(x)(x^2 + w - v),\\ \\sin(y)(y^2 + w - v)),\\ v = (x^2 + y^2)w',
    params: {
      w: {
        description:
          'Weight on the squared radius and the additive constant, controlling the ripple amplitude and range.',
      },
    },
  },
  kochVar: {
    summary:
      'Approximates a Koch curve generator by scaling the point to one third and routing it through one of four affine segment transforms selected by a fractional position, building the snowflake fold.',
    params: {
      iterations: {
        description:
          'Nominal Koch iteration depth control (not used by the current transform body).',
      },
    },
  },
  splitsVar: {
    summary:
      'Splits the plane along the x and y axes, pushing points away from each axis by separate offsets, with optional shear applied to each of the four resulting regions.',
    params: {
      x: {
        description:
          'Horizontal split distance; points are pushed left or right by this amount depending on the sign of x.',
      },
      y: {
        description:
          'Vertical split distance; points are pushed up or down by this amount depending on the sign of y.',
      },
      lshear: {
        description:
          'Vertical shear subtracted from points on the left side (negative x).',
      },
      rshear: {
        description:
          'Vertical shear added to points on the right side (non-negative x).',
      },
      ushear: {
        description:
          'Horizontal shear added to points in the upper region (non-negative y).',
      },
      dshear: {
        description:
          'Horizontal shear subtracted from points in the lower region (negative y).',
      },
    },
  },
  murl2Var: {
    summary:
      'A generalized Mobius-style fold that raises the polar angle and radius to a power, applies a complex translate and root, then maps the point through the resulting transform. Produces curl-like swirling structures.',
    params: {
      c: {
        description:
          'Strength of the complex offset added before the power-root step; controls the amount of curling.',
      },
      power: {
        description:
          'Exponent applied to the angle and used in the radial root; sets how many times the field winds around.',
      },
    },
  },
  scry2Var: {
    summary:
      'Folds the point into a regular polygonal sector by taking the maximum projection across rotated copies, then applies an inverse-radius scaling, optionally blending toward a star or circular profile.',
    params: {
      sides: {
        description:
          'Number of polygon sides (rounded to an integer) used to fold the point into a sector.',
      },
      star: {
        description:
          'Blends the edge profile toward a star shape by tilting the projection direction.',
      },
      circle: {
        description:
          'Blends the folded radius toward the plain circular radius for a rounder result.',
      },
    },
  },
  octagonVar: {
    summary:
      'Scales the point by an inverse-radius factor chosen from a set of formulas selected by the splits parameter, with the radius clamped through a softened distance when small. The splits index switches the sign and offset of the scaling.',
    params: {
      splits: {
        description:
          'Integer mode selector (0 to 6) choosing which inverse-radius scaling formula is applied.',
      },
    },
  },
  onion2Var: {
    summary:
      'Maps the point onto an onion-like curve built from the doubled polar angle, where one branch follows a cosine profile and the other an exponential profile gated by a meeting-point parameter, with optional cropping of the top.',
    params: {
      meeting_pt: {
        description:
          'Angle threshold and shaping value where the exponential and cosine branches meet; also feeds the tangent, cosine, and sine used to build the curve.',
      },
      top_crop: {
        description:
          'Upper clamp applied to the curve height; values above it are flattened to this level when positive.',
      },
      circle_a: {
        description: 'Radial scale multiplier applied to the resulting curve.',
      },
      circle_b: {
        description: 'Secondary circle parameter exposed in the editor.',
      },
    },
  },
  rippleVar: {
    summary:
      'Displaces points radially around a center using a traveling cosine wave, interpolating between two wave amplitudes by phase to create concentric ripple patterns. Includes a toggle for the distance metric.',
    params: {
      frequency: {
        description:
          'Spatial frequency of the ripple wave (scaled internally by five).',
      },
      velocity: {
        description: 'Phase velocity that shifts the wave inward or outward.',
      },
      amplitude: {
        description:
          'Height of the ripple displacement (scaled internally by one hundredth).',
      },
      centerx: { description: 'X coordinate of the ripple center.' },
      centery: { description: 'Y coordinate of the ripple center.' },
      phase: {
        description:
          'Wave phase, also the blend factor between the two ripple amplitudes; remapped into a range around zero.',
      },
      scale: {
        description:
          'Overall coordinate scale applied before and inverted after the ripple; guarded against zero.',
      },
      fixed_dist_calc: {
        description:
          'Toggle (treated as boolean) selecting the Euclidean distance when on versus a product-based distance when off.',
      },
    },
  },
  kaleidoscopeVar: {
    summary:
      'Rotates the point by 45 degrees with an x-scale, then mirrors the y component above and below the axis with separate pull and line-up offsets, producing mirrored kaleidoscope wedges.',
    params: {
      pull: {
        description:
          'Offset that pulls the two mirrored halves apart or together along the y axis.',
      },
      rotate: {
        description:
          'Horizontal scale applied to both rotated coordinates before mirroring.',
      },
      lineUp: {
        description:
          'Shared offset added to align the halves; applied to x and both y branches.',
      },
      x: {
        description: 'Additional horizontal translation added to the output x.',
      },
      y: {
        description:
          'Additional vertical translation added to the upper-half y output.',
      },
    },
  },
  powBlockVar: {
    summary:
      'A power-based angular variation that raises the radius to a fraction built from the numerator, denominator, and correction terms, then rotates by a multiple of the angle plus a random discrete root offset, producing blocky rotational symmetry.',
    params: {
      numerator: {
        description:
          'Top of the power fraction; also multiplies the final rotation angle.',
      },
      denominator: {
        description:
          'Bottom of the power fraction and the divisor for the angle and root steps; guarded against zero.',
      },
      root: {
        description:
          'Scales the random discrete branch offset that selects which rotational copy a point lands in.',
      },
      correctn: {
        description:
          'Numerator correction factor folded into the computed power.',
      },
      correctd: {
        description:
          'Denominator correction factor folded into the computed power; guarded against zero.',
      },
    },
  },
  wedgeSphVar: {
    summary:
      'A spherical wedge variation that inverts the radius, twists the angle by a swirl proportional to that inverted radius, then quantizes the angle into wedge sectors and offsets the radius by a hole amount.',
    params: {
      angle: {
        description:
          'Angular width of each wedge sector; combines with count to set the sector compression.',
      },
      hole: {
        description:
          'Radial offset added to the inverted radius, opening or closing a central hole.',
      },
      count: {
        description: 'Number of wedge sectors the angle is quantized into.',
      },
      swirl: {
        description:
          'Amount of angular twist applied proportional to the inverted radius.',
      },
    },
    tex: 'r=\\frac{1}{\\sqrt{x^2+y^2}},\\ a=\\theta+\\text{swirl}\\cdot r,\\ V=(r+\\text{hole})(\\cos a,\\sin a)',
  },
  murlVar: {
    summary:
      'A Mobius-style curl that scales the input by a complex factor derived from raising the angle and radius to a power and adding one, then maps the point through the resulting transform to create curling spirals.',
    params: {
      c: {
        description:
          'Curl strength; divided by power minus one before use and controls how tightly the field curls.',
      },
      power: {
        description:
          'Integer exponent applied to the angle and radius, setting the rotational order of the curl.',
      },
    },
  },
  sunflowerVar: {
    summary:
      'Maps each point to a position on a Fermat phyllotaxis spiral by deriving an index from the input radius and placing it at the golden angle, producing sunflower-seed packing patterns.',
    params: {
      scale: {
        description:
          'Radial scale of the spiral, controlling the overall size of the seed pattern.',
      },
      n: {
        description:
          'Number of seeds, which sets the index range and density of the spiral.',
      },
    },
    tex: 'V=\\text{scale}\\sqrt{i/n}\\,(\\cos\\theta,\\sin\\theta),\\ \\theta=i\\cdot 2.39996',
  },
  juliaCVar: {
    summary:
      'A complex Julia-style power map with a separately scaled imaginary part, applying a random angular offset and combining a log-modulus rotation with an exponential modulus to spread points into Julia-set arms.',
    params: {
      re: {
        description:
          'Real power divisor; its reciprocal scales the angle and modulus, controlling the number of arms.',
      },
      im: {
        description:
          'Imaginary power component (scaled by one hundredth) that twists the angle and modulus together.',
      },
      dist: {
        description:
          'Scales the log-radius term, controlling how strongly radial distance feeds back into the angle.',
      },
    },
  },
  treeVar: {
    summary:
      'Bins the absolute x coordinate into branches, rotates each branch by an angle proportional to its index, scales the result, and lifts it upward, building a recursive tree-like branching structure.',
    params: {
      branches: {
        description:
          'Number of branch bins the horizontal axis is divided into.',
      },
      angle: {
        description: 'Maximum rotation applied to the outermost branches.',
      },
      scale: {
        description: 'Shrink factor applied to each branch after rotation.',
      },
    },
  },
  layeredSpiralVar: {
    summary:
      'Adds a radius-scaled displacement to the point whose direction rotates with the squared distance from the origin, layering spiral arms outward.',
    params: {
      radius: {
        description:
          'Scales the x-derived amplitude of the spiral displacement.',
      },
    },
    tex: 'a=x\\cdot\\text{radius},\\ t=x^2+y^2,\\ V=(x+wa\\cos t,\\ y+wa\\sin t)',
  },
  lineVar: {
    summary:
      'Ignores the input point and emits a random sample along a fixed direction on the unit sphere defined by two spherical angles, drawing a line in the plane.',
    params: {
      delta: {
        description:
          'Azimuthal angle (in units of pi) setting the line direction in the xy plane.',
      },
      phi: {
        description:
          'Polar angle (in units of pi) tilting the direction out of the plane before projection.',
      },
    },
  },
  oscilloscopeVar: {
    summary:
      'Reflects the y coordinate across a damped cosine waveform of x, keeping points whose vertical distance stays within the wave envelope and flipping those outside, mimicking an oscilloscope trace.',
    params: {
      separation: {
        description: 'Vertical baseline offset added to the waveform envelope.',
      },
      frequency: {
        description: 'Frequency of the cosine waveform along the x axis.',
      },
      amplitude: { description: 'Peak height of the waveform before damping.' },
      damping: {
        description:
          'Exponential decay of the amplitude with distance from the y axis.',
      },
    },
    tex: 't=\\text{amplitude}\\,e^{-|x|\\,\\text{damping}}\\cos(2\\pi\\,\\text{frequency}\\,x)+\\text{separation}',
  },
  splipticBSVar: {
    summary:
      'A blurred elliptic variation that maps the point through elliptic coordinates using inverse trig and log of the elliptic radius, offsetting the two contributions and randomly flipping the sign of the y term.',
    params: {
      x: {
        description:
          'Horizontal offset added or subtracted from the elliptic angle term depending on the sign of x.',
      },
      y: {
        description:
          'Vertical offset added to the log-based elliptic radius term.',
      },
    },
  },
  waves4Var: {
    summary:
      'A waves variant that displaces x by a sine of y modulated by a per-row pseudo-random factor and displaces y by a sine of x, with an option to quantize the random factor into discrete bands.',
    params: {
      scalex: { description: 'Amplitude of the horizontal sine displacement.' },
      scaley: { description: 'Amplitude of the vertical sine displacement.' },
      freqx: {
        description:
          'Frequency of the sine wave driving the horizontal displacement and the row binning.',
      },
      freqy: {
        description:
          'Frequency of the sine wave driving the vertical displacement.',
      },
      cont: {
        description:
          'Toggle that snaps the per-row random factor to either zero or one for discrete banding.',
      },
      yfact: {
        description:
          'Scales how strongly y feeds into the per-row pseudo-random seed.',
      },
    },
  },
  modulusVar: {
    summary:
      'Wraps the point into a rectangular tile by folding x and y back into the ranges set by the x and y half-widths whenever they exceed the bounds, producing a repeating modular tiling.',
    params: {
      x: {
        description:
          'Horizontal half-width of the wrap region; the x coordinate is folded into its range.',
      },
      y: {
        description:
          'Vertical half-width of the wrap region; the y coordinate is folded into its range.',
      },
    },
  },
  q_odeVar: {
    summary:
      'Adds a general bivariate quadratic polynomial of x and y to the point, with twelve coefficients defining the two output deltas, emulating a quadratic ordinary differential equation step.',
    params: {
      q_ode01: { description: 'Constant term of the x delta.' },
      q_ode02: {
        description: 'Linear x coefficient of the x delta (scaled by weight).',
      },
      q_ode03: {
        description: 'Quadratic x squared coefficient of the x delta.',
      },
      q_ode04: { description: 'Cross x times y coefficient of the x delta.' },
      q_ode05: { description: 'Linear y coefficient of the x delta.' },
      q_ode06: {
        description: 'Quadratic y squared coefficient of the x delta.',
      },
      q_ode07: { description: 'Constant term of the y delta.' },
      q_ode08: { description: 'Linear x coefficient of the y delta.' },
      q_ode09: {
        description: 'Quadratic x squared coefficient of the y delta.',
      },
      q_ode10: { description: 'Cross x times y coefficient of the y delta.' },
      q_ode11: {
        description: 'Linear y coefficient of the y delta (scaled by weight).',
      },
      q_ode12: {
        description: 'Quadratic y squared coefficient of the y delta.',
      },
    },
  },
  truchet2Var: {
    summary:
      'Builds a Truchet tile pattern by computing rounded super-ellipse arc distances within each integer cell, choosing one of two tile orientations from a seeded hash, and keeping or discarding points based on whether they fall within the arc bands.',
    params: {
      exponent1: {
        description:
          'Super-ellipse exponent at the left edge of each tile, blended across the cell.',
      },
      exponent2: {
        description:
          'Super-ellipse exponent at the right edge of each tile, blended across the cell.',
      },
      width1: {
        description:
          'Arc band width at the left edge of each tile, blended across the cell.',
      },
      width2: {
        description:
          'Arc band width at the right edge of each tile, blended across the cell.',
      },
      scale: {
        description:
          'Tile scale dividing the input coordinates to set tile size.',
      },
      seed: {
        description:
          'Seed controlling the per-cell pseudo-random tile orientation; zero and one force fixed orientations.',
      },
      inverse: {
        description:
          'Toggle that inverts which regions are kept, drawing the complement of the arc bands.',
      },
    },
  },
  logTile2Var: {
    summary:
      'Scatters points by random integer steps whose size comes from rounding the log of a uniform random value, with the step sign for each axis chosen randomly, creating logarithmically spaced tiles.',
    params: {
      spreadx: {
        description:
          'Magnitude of the random horizontal step (its sign is randomized).',
      },
      spready: {
        description:
          'Magnitude of the random vertical step (its sign is randomized).',
      },
    },
  },
  targetVar: {
    summary:
      'Rotates the point by one of two angles depending on which logarithmic radial ring it falls in, producing concentric target bands with alternating twist.',
    params: {
      even: {
        description:
          'Rotation angle added for points in the inner part of each log-radius band.',
      },
      odd: {
        description:
          'Rotation angle added for points in the outer part of each log-radius band.',
      },
      size: {
        description:
          'Width of each logarithmic ring band used to alternate between the even and odd angles.',
      },
    },
  },
  ovoidVar: {
    summary:
      'Pushes the point outward by an inverse-square-distance factor scaled separately on each axis, producing egg-shaped warping.',
    params: {
      x: {
        description: 'Horizontal scale of the inverse-distance displacement.',
      },
      y: {
        description: 'Vertical scale of the inverse-distance displacement.',
      },
    },
    tex: 'T=x^2+y^2,\\ r=w/T,\\ V=(x+xrP_x,\\ y+yrP_y)',
  },
  waffleVar: {
    summary:
      'Randomly snaps points onto a grid of waffle cells, choosing among five placement modes that put samples on cell interiors, edges, or fills, then rotates the result, producing a gridded waffle texture.',
    params: {
      slices: {
        description:
          'Number of grid divisions per axis defining the waffle cell count.',
      },
      xthickness: {
        description: 'Fractional thickness of the horizontal grid lines.',
      },
      ythickness: {
        description: 'Fractional thickness of the vertical grid lines.',
      },
      rotation: {
        description: 'Rotation angle applied to the final gridded coordinates.',
      },
    },
  },
  swirl3Var: {
    summary:
      'Twists the point around the origin by an angle that grows with the logarithm of its radius, scaled by a shift parameter, creating a logarithmic spiral swirl.',
    params: {
      shift: {
        description: 'Strength of the log-radius dependent angular twist.',
      },
    },
    tex: 'a=\\theta+\\log(r)\\cdot\\text{shift},\\ V=r(\\cos a,\\sin a)',
  },
  oscilloscope2Var: {
    summary:
      'A waveform threshold mask that folds the plane through the origin when the point lies below a cosine wave envelope, optionally damped along x and perturbed by a vertical sine term. Points above the envelope pass through unchanged.',
    params: {
      separation: {
        description:
          'Vertical offset added to the wave envelope, shifting the threshold band up or down.',
      },
      frequencyx: {
        description: 'Horizontal frequency of the main cosine carrier wave.',
      },
      frequencyy: {
        description:
          'Vertical frequency of the sine perturbation that bends the wave along y.',
      },
      amplitude: { description: 'Amplitude of the cosine envelope.' },
      perturbation: {
        description:
          'Strength of the vertical sine perturbation added to the cosine phase.',
      },
      damping: {
        description:
          'Exponential decay applied along x; when near zero an undamped wave is used instead.',
      },
    },
  },
  phoenixJuliaVar: {
    summary:
      'A Julia-style variation that pre-distorts the input coordinates, then maps the angle and radius through a power so the output winds around the origin with random angular branching. Produces phoenix-like Julia structures.',
    params: {
      power: {
        description:
          'Divides the angle and radius exponent, controlling how many times the form wraps around the origin.',
      },
      dist: {
        description:
          'Scales the angular and radial exponents, stretching or compressing the spiral.',
      },
      x_distort: {
        description: 'Pre-scales the x input coordinate before the transform.',
      },
      y_distort: {
        description: 'Pre-scales the y input coordinate before the transform.',
      },
    },
  },
  perspectiveVar: {
    summary:
      'Applies a perspective projection that foreshortens the plane based on the y coordinate, scaling x and y by a depth factor that grows toward a vanishing line.',
    tex: 'V=\\left(\\frac{x\\,d}{d - y\\sin\\theta},\\ \\frac{y\\cos\\theta\\,d}{d - y\\sin\\theta}\\right)',
    params: {
      angle: {
        description:
          'Tilt angle of the perspective plane, controlling the foreshortening direction.',
      },
      dist: {
        description:
          'Distance to the projection plane, setting how strong the perspective effect is.',
      },
    },
  },
  invEllipseVar: {
    summary:
      'Inverts points across an axis-aligned ellipse centered at (h, k); points outside (or all points when unrestricted) are mapped to the reciprocal of the ellipse equation, while interior points pass through unchanged in restricted mode.',
    params: {
      a: { description: 'Major (x) semi-axis length of the ellipse.' },
      b: { description: 'Minor (y) semi-axis length of the ellipse.' },
      h: { description: 'X coordinate of the ellipse center.' },
      k: { description: 'Y coordinate of the ellipse center.' },
      restricted: {
        description:
          'When positive, points inside the ellipse are left unchanged; otherwise all points are inverted.',
      },
    },
  },
  sierCarpetVar: {
    summary:
      'Maps the unit square into a Sierpinski carpet cell structure by subdividing into a three by three grid and collapsing the central cell toward its center, leaving the carpet hole pattern.',
    params: {
      iterations: {
        description:
          'Number of subdivision iterations controlling the depth of the carpet detail.',
      },
    },
  },
  maurerRoseVar: {
    summary:
      'Generates a Maurer rose curve by treating x as a parameter that steps in fixed degree increments, plotting a rose of n petals connected by straight line walks.',
    tex: 'V=(r\\cos\\theta,\\ r\\sin\\theta),\\ t = x\\,d\\,\\pi,\\ r = \\sin(n\\,t),\\ \\theta = t',
    params: {
      n: { description: 'Number of petals of the underlying rose curve.' },
      d: {
        description:
          'Angular step in degrees between successive sampled points, producing the Maurer line pattern.',
      },
    },
  },
  logApoVar: {
    summary:
      'Logarithmic map that converts the point to log-polar form, placing the log of the squared radius on x and the polar angle on y, with the radial scale set by an adjustable logarithm base.',
    tex: 'V=\\left(\\frac{\\ln(x^2+y^2)}{2\\ln(\\text{base})},\\ \\operatorname{atan2}(y, x)\\right)',
    params: {
      base: {
        description:
          'Logarithm base controlling the radial scaling of the log-polar mapping.',
      },
    },
  },
  sinusGridVar: {
    summary:
      'Warps the plane toward a sinusoidal grid by interpolating each coordinate between its original value and a negated cosine of that coordinate scaled by frequency, with per-axis amplitude blending.',
    params: {
      ampx: {
        description: 'Blend amount toward the sinusoidal target along x.',
      },
      ampy: {
        description: 'Blend amount toward the sinusoidal target along y.',
      },
      freqx: { description: 'Frequency of the cosine grid along x.' },
      freqy: { description: 'Frequency of the cosine grid along y.' },
    },
  },
  stripesVar: {
    summary:
      'Quantizes x into integer stripes, compressing the fractional offset within each stripe and bending y by a squared offset term, producing warped vertical bands.',
    tex: 'V=\\left(o(1-\\text{space}) + n,\\ y + o^2\\,\\text{warp}\\right),\\ n = \\lfloor x + 0.5\\rfloor,\\ o = x - n',
    params: {
      space: {
        description:
          'Amount of horizontal compression applied to the offset within each stripe.',
      },
      warp: {
        description:
          'Strength of the parabolic vertical bend applied based on the stripe offset.',
      },
    },
  },
  wedgeJuliaVar: {
    summary:
      'Combines a Julia power map with wedge folding; the radius is raised to a power, a random angular branch is chosen, and the angle is quantized into wedges and rotated, yielding segmented spiral fans.',
    params: {
      power: {
        description:
          'Julia power dividing the angle and setting the number of random angular branches.',
      },
      dist: {
        description:
          'Scales the radial exponent applied to the squared radius.',
      },
      count: {
        description: 'Number of wedge segments the angle is folded into.',
      },
      angle: { description: 'Rotation applied to each wedge segment.' },
    },
  },
  pulseVar: {
    summary:
      'Doubles each coordinate and adds a sinusoidal pulse along each axis, scaled and frequency-controlled independently per axis.',
    tex: 'V=\\left(2x + \\text{scalex}\\sin(x\\,\\text{freqx}),\\ 2y + \\text{scaley}\\sin(y\\,\\text{freqy})\\right)',
    params: {
      freqx: { description: 'Frequency of the sine pulse along x.' },
      freqy: { description: 'Frequency of the sine pulse along y.' },
      scalex: { description: 'Amplitude of the sine pulse along x.' },
      scaley: { description: 'Amplitude of the sine pulse along y.' },
    },
  },
  waves3Var: {
    summary:
      'A waves variation that displaces each coordinate by a sine of the opposite coordinate, where the displacement amplitude is itself modulated by a second sine, creating amplitude-varying ripples.',
    params: {
      scalex: { description: 'Base displacement amplitude along x.' },
      scaley: { description: 'Base displacement amplitude along y.' },
      freqx: {
        description: 'Frequency of the primary sine displacement along x.',
      },
      freqy: {
        description: 'Frequency of the primary sine displacement along y.',
      },
      sxFreq: {
        description:
          'Frequency of the secondary sine that modulates the x displacement amplitude.',
      },
      syFreq: {
        description:
          'Frequency of the secondary sine that modulates the y displacement amplitude.',
      },
    },
  },
  inversionVar: {
    summary:
      'Circle inversion about an adjustable center; each point is mapped to the reciprocal of its squared distance from the center scaled by the squared radius, turning the inside out around the circle.',
    tex: 'V=\\left(c_x + d_x\\frac{r^2}{|d|^2},\\ c_y + d_y\\frac{r^2}{|d|^2}\\right),\\ d = (x - c_x,\\ y - c_y)',
    params: {
      radius: {
        description:
          'Radius of the inversion circle setting the inversion scale.',
      },
      centerX: { description: 'X coordinate of the inversion center.' },
      centerY: { description: 'Y coordinate of the inversion center.' },
    },
  },
  macMillanVar: {
    summary:
      'Applies the MacMillan area-preserving map twice in sequence, using a sine-like rational nonlinearity to swap and update coordinates, producing concentric island-chain dynamics.',
    params: {
      a: {
        description:
          'Strength of the rational nonlinear term in the MacMillan map.',
      },
      b: { description: 'Linear feedback coefficient of the MacMillan map.' },
    },
  },
  wedgeVar: {
    summary:
      'Folds the plane into angular wedges, adding a radial swirl to the angle, quantizing into segments, and offsetting the radius by a hole term to create gapped pie-slice fans.',
    params: {
      angle: { description: 'Rotation applied to each wedge segment.' },
      hole: {
        description:
          'Radial offset added to every point, opening or closing a central hole.',
      },
      count: {
        description: 'Number of wedge segments the angle is divided into.',
      },
      swirl: { description: 'Radius-dependent twist added to the angle.' },
    },
  },
  loqVar: {
    summary:
      'A complex logarithm style map placing the log of the squared magnitude on x and a scaled angular term on y, with the radial scale controlled by an adjustable logarithm base.',
    params: {
      base: {
        description:
          'Logarithm base controlling the radial scaling of the log mapping.',
      },
    },
  },
  pTransformVar: {
    summary:
      'Polar transform that rotates the angle and remaps the radius either linearly or through a logarithm, with an optional sign-dependent split offset and exponential re-expansion in log mode.',
    params: {
      rotate: {
        description: 'Angle added to the polar angle before reconstruction.',
      },
      power: {
        description: 'Divides the radius term, scaling the radial remapping.',
      },
      shift: { description: 'Constant offset added to the remapped radius.' },
      split: {
        description:
          'Radius offset whose sign depends on whether x is non-negative, splitting the form.',
      },
      useLog: {
        description:
          'Toggles between logarithmic radius remapping with exponential re-expansion and linear remapping.',
      },
    },
  },
  tileHlpVar: {
    summary:
      'Tiling helper that doubles each coordinate and probabilistically shifts x by one tile width left or right based on a cosine of the tiled position compared against a random threshold.',
    params: {
      width: {
        description:
          'Tile width controlling the spacing of the horizontal tiling and the shift magnitude.',
      },
    },
  },
  maskVar: {
    summary:
      'A masked sinusoidal map that scales the squared magnitude by a sine and hyperbolic cosine product, projecting onto sine and cosine of a shifted, scaled x to carve out wave-shaped masks. Returns the origin near the singularity.',
    params: {
      xshift: {
        description:
          'Phase shift added to the scaled x before the sine and cosine.',
      },
      yshift: {
        description:
          'Shift added to the scaled y inside the hyperbolic cosine term.',
      },
      ushift: {
        description:
          'Constant added to the hyperbolic cosine term, biasing the mask magnitude.',
      },
      xscale: { description: 'Scale applied to x before the sine and cosine.' },
      yscale: {
        description: 'Scale applied to y inside the hyperbolic cosine term.',
      },
    },
  },
  shredlinVar: {
    summary:
      'Shreds the plane into a grid of linear cells, compressing the fractional position within each cell by a per-axis width and re-centering based on the sign of the coordinate, producing torn strip patterns.',
    params: {
      xdistance: {
        description:
          'Cell spacing along x setting the period of the shredding grid.',
      },
      xwidth: {
        description:
          'Fraction of each x cell that the content is compressed into.',
      },
      ydistance: {
        description:
          'Cell spacing along y setting the period of the shredding grid.',
      },
      ywidth: {
        description:
          'Fraction of each y cell that the content is compressed into.',
      },
    },
  },
  tunnelVar: {
    summary:
      'Creates a tunnel distortion by shifting points toward the center based on a curved distortion profile derived from the y position, with independent horizontal and vertical shift strengths.',
    params: {
      Sx: {
        description: 'Horizontal shift strength of the tunnel distortion.',
      },
      Sy: { description: 'Vertical shift strength of the tunnel distortion.' },
    },
  },
  squishVar: {
    summary:
      'Maps points onto the perimeter of a square by computing a perimeter parameter from the dominant coordinate, randomly stepping it by full perimeter spans scaled by a power, then placing the result back on one of the four square edges.',
    params: {
      power: {
        description:
          'Number of random perimeter wraps; higher values fold more copies around the square boundary.',
      },
    },
  },
  rational3Var: {
    summary:
      'Evaluates a rational function of a complex number with cubic numerator and denominator polynomials, dividing the complex numerator by the complex denominator to produce intricate symmetric warps.',
    params: {
      a: { description: 'Cubic-term coefficient of the numerator polynomial.' },
      b: {
        description: 'Quadratic-term coefficient of the numerator polynomial.',
      },
      c: {
        description: 'Linear-term coefficient of the numerator polynomial.',
      },
      d: { description: 'Constant term of the numerator polynomial.' },
      e: {
        description: 'Cubic-term coefficient of the denominator polynomial.',
      },
      f: {
        description:
          'Quadratic-term coefficient of the denominator polynomial.',
      },
      g: {
        description: 'Linear-term coefficient of the denominator polynomial.',
      },
      h: { description: 'Constant term of the denominator polynomial.' },
    },
  },
  superShapeVar: {
    summary:
      'Reshapes the radius using the Gielis superformula, blending the original radius with a random radius and a superellipse-style shape function to bend points toward parametric supershape outlines.',
    params: {
      rnd: {
        description:
          'Blend amount between a random radius and the original radius in the shape factor.',
      },
      m: {
        description:
          'Rotational symmetry parameter of the superformula, setting the number of lobes.',
      },
      n1: {
        description:
          'Primary superformula exponent controlling overall shape sharpness.',
      },
      n2: { description: 'Superformula exponent applied to the cosine term.' },
      n3: { description: 'Superformula exponent applied to the sine term.' },
      holes: {
        description:
          'Offset subtracted from the radius, opening holes in the shape.',
      },
    },
  },
}
