import type { VariationDocMap } from './types'

/**
 * Documentation for the "general" group of parametric variations. Summaries,
 * parameter prose, and formulas were drafted from each variation's own
 * implementation. Maps that rely on random()/iteration/long coefficient blends
 * are described qualitatively without a `tex` formula. Refine as needed — keys
 * are the registry type-literals and parameter struct fields, checked by
 * docs.coverage.test.
 */
export const variationDocsGeneral: VariationDocMap = {
  anamorphCylVar: {
    summary:
      'Wraps the input around a cylinder by mapping x to an angle and y to a radial offset, producing curved cylindrical bands.',
    tex: 'V = a (y + b) (\\cos(k x), \\sin(k x))',
    params: {
      a: { description: 'Overall scale of the cylindrical radius.' },
      b: {
        description:
          'Radial offset added to y before scaling, shifting points away from the cylinder axis.',
      },
      k: {
        description:
          'Angular frequency that controls how many times x wraps around the cylinder.',
      },
    },
  },
  asteriaVar: {
    summary:
      'Rotates points by an angle controlled by alpha, but leaves points inside an overlap region of a disk and a star shape randomly unrotated, creating a star burst pattern.',
    params: {
      alpha: {
        description:
          'Fraction of half a turn used as the rotation angle applied to points outside the protected region.',
      },
    },
  },
  atan2SpiralsVar: {
    summary:
      'Builds spirals by feeding scaled and offset powers of the squared radius into atan2 for the x output and a sine for the y output.',
    tex: 'V = weight\\,(x\\_mult\\,\\arctan\\!\\tfrac{r\\cdot r\\_mult + r\\_add}{q\\cdot xy2\\_mult + xy2\\_add} + x\\_add,\\ y\\_mult\\sin(q\\cdot xy2\\_mult + xy2\\_add + sin\\_add) + y\\_add),\\ r=(x^2+y^2)^{r\\_power},\\ q=(x^2+y^2)^{x2y2\\_power}',
    params: {
      r_mult: {
        description:
          'Multiplier on the radius power feeding the first argument of atan2.',
      },
      r_add: { description: 'Constant added to the radius term inside atan2.' },
      xy2_mult: {
        description:
          'Multiplier on the squared radius power used in both the atan2 denominator and the sine argument.',
      },
      xy2_add: {
        description:
          'Constant added to the squared radius term used in atan2 and the sine.',
      },
      x_mult: {
        description: 'Scale applied to the atan2 result for the x component.',
      },
      x_add: { description: 'Constant added to the x component.' },
      y_mult: {
        description: 'Scale applied to the sine result for the y component.',
      },
      y_add: { description: 'Constant added to the y component.' },
      r_power: {
        description:
          'Exponent applied to the squared radius to form the radius term.',
      },
      x2y2_power: {
        description:
          'Exponent applied to the squared radius to form the xy2 term.',
      },
      sin_add: {
        description: 'Phase added inside the sine for the y component.',
      },
    },
  },
  atanVar: {
    summary:
      'Applies a normalized arctangent to one or both coordinates depending on the mode, compressing values toward a finite band.',
    tex: 'V = \\tfrac{2}{\\pi} \\arctan(stretch \\cdot \\cdot)',
    params: {
      mode: {
        description:
          'Selects which axis is squashed: 0 applies atan to y, 1 applies it to x, and 2 applies it to both.',
      },
      stretch: {
        description:
          'Scales the coordinate before the arctangent, controlling how sharply values are compressed.',
      },
    },
  },
  bTransformVar: {
    summary:
      'Maps the plane through a bipolar coordinate transform with adjustable rotation, angular subdivision, and a sign-dependent split offset.',
    params: {
      rotate: {
        description:
          'Angular offset added to the bipolar angle before subdivision.',
      },
      power: {
        description:
          'Divides the radial and angular coordinates and sets the number of random angular sectors.',
      },
      offset: {
        description: 'Constant added to the radial bipolar coordinate.',
      },
      split: {
        description:
          'Radial offset added or subtracted depending on the sign of the input x.',
      },
    },
  },
  barycentroidVar: {
    summary:
      'Computes barycentric-style coordinates of the input point relative to two basis vectors defined by the parameters, returning the two weights.',
    tex: 'V = \\frac{weight}{ad-bc}(d(ax+by) - b(cx+dy),\\ a(cx+dy) - c(ax+by))\\ \\text{(barycentric solve, dots over (a,b),(c,d))}',
    params: {
      a: { description: 'X component of the first basis vector.' },
      b: { description: 'Y component of the first basis vector.' },
      c: { description: 'X component of the second basis vector.' },
      d: { description: 'Y component of the second basis vector.' },
    },
  },
  bcollideVar: {
    summary:
      'Transforms through bipolar coordinates while folding the angle into a set of sectors, with alternating sectors shifted in opposite directions to make points collide.',
    params: {
      num: {
        description:
          'Number of angular sectors the bipolar angle is divided into.',
      },
      a: {
        description:
          'Fractional shift applied within each sector, alternating sign between even and odd sectors.',
      },
    },
  },
  bent2Var: {
    summary:
      'Scales the negative half-planes of x and y independently, leaving the positive sides unchanged to bend the plane along each axis.',
    tex: "V = weight\\,(x',\\ y'),\\ x'=\\begin{cases}factorX\\cdot x & x<0\\\\ x & x\\ge0\\end{cases},\\ y'=\\begin{cases}factorY\\cdot y & y<0\\\\ y & y\\ge0\\end{cases}",
    params: {
      factorX: { description: 'Scale applied to x only when x is negative.' },
      factorY: { description: 'Scale applied to y only when y is negative.' },
    },
  },
  bipolar2Var: {
    summary:
      'An extended bipolar map with tunable foci, scaling, and shift that produces a logarithmic x coordinate and a wrapped angular y coordinate.',
    params: {
      shift: {
        description:
          'Phase shift applied to the angular coordinate before wrapping.',
      },
      a: {
        description:
          'Constant added to the scaled squared radius forming the base term.',
      },
      b: {
        description:
          'Scale on x used to offset the logarithm numerator and denominator.',
      },
      c: {
        description:
          'Scale on the arctangent that produces the angular coordinate.',
      },
      d: {
        description:
          'Offset subtracted from the squared radius inside the arctangent.',
      },
      e: { description: 'Scale on y inside the arctangent.' },
      f1: { description: 'Scale on the logarithmic x output.' },
      g1: {
        description:
          'Scale on the squared radius before forming the base term.',
      },
      h: { description: 'Scale on the angular y output.' },
    },
  },
  blockYVar: {
    summary:
      'Combines a periodic cosine modulation with elliptic-style radial maxima to produce a blocky cellular y-warped pattern.',
    tex: 'V = \\frac{weight}{(\\pi/2)\\,T}(x_{max}\\,x,\\ y_{max}\\,y),\\ T=\\tfrac{\\cos x+\\cos y}{mp}+1,\\ x_{max}=\\tfrac12(\\sqrt{s+2x}+\\sqrt{s-2x}),\\ y_{max}=\\tfrac12(\\sqrt{s+2y}+\\sqrt{s-2y}),\\ s=x^2+y^2+1',
    params: {
      x: { description: 'Scale applied to the x output.' },
      y: { description: 'Scale applied to the y output.' },
      mp: {
        description:
          'Divides the cosine modulation term, controlling the strength of the periodic blocking.',
      },
    },
  },
  bmodVar: {
    summary:
      'A bipolar transform that wraps the radial coordinate into a band of given radius, creating repeating mirrored shells.',
    params: {
      radius: {
        description:
          'Half-width of the radial band into which the bipolar radial coordinate is folded.',
      },
      distance: {
        description:
          'Additional shift applied to the radial coordinate before folding within the band.',
      },
    },
  },
  boarders2Var: {
    summary:
      'Splits each integer cell into a shrunken interior and a border region, randomly routing points to the inside or to one of the cell edges to draw framed tiles.',
    params: {
      c: {
        description:
          'Base cell scale that shrinks points toward their cell center and sets the border thickness.',
      },
      left: { description: 'Scales the left border offset.' },
      right: {
        description:
          'Sets the probability threshold splitting points between the interior and the border regions.',
      },
      bottom: { description: 'Bottom border control parameter.' },
      top: { description: 'Scales the top and vertical border offset.' },
    },
  },
  boxfoldVar: {
    summary:
      'Reflects coordinates that exceed a fold limit back into the central box and then applies optional rotations around the x, y, and z axes.',
    params: {
      foldLimit: {
        description:
          'Threshold beyond which coordinates are reflected back toward the center.',
      },
      rotateX: {
        description: 'Rotation angle around the x axis applied after folding.',
      },
      rotateY: {
        description: 'Rotation angle around the y axis applied after folding.',
      },
      rotateZ: {
        description: 'Rotation angle around the z axis applied after folding.',
      },
    },
  },
  bsplitVar: {
    summary:
      'Splits the plane using trigonometric ratios, dividing a cosine of shifted y by a tangent of shifted x and a shifted y by a sine of shifted x.',
    tex: 'V = (\\tfrac{\\cos(y + y)}{\\tan(x + x)}, \\tfrac{-y + y}{\\sin(x + x)})',
    params: {
      x: {
        description: 'Offset added to x inside the tangent and sine terms.',
      },
      y: {
        description:
          'Offset added to y inside the cosine and the numerator of the y output.',
      },
    },
  },
  bswirlVar: {
    summary:
      'A bipolar transform whose angular coordinate is swirled by terms proportional to and inversely proportional to the radial coordinate.',
    tex: 'V = weight\\,\\frac{(\\sinh\\tau,\\ \\sin\\sigma)}{\\cosh\\tau - \\cos\\sigma},\\ \\tau=\\tfrac12\\ln\\tfrac{(x+1)^2+y^2}{(x-1)^2+y^2},\\ \\sigma=\\pi-\\arctan\\tfrac{y}{x+1}-\\arctan\\tfrac{y}{1-x}+\\tau\\,out+\\tfrac{in}{\\tau}',
    params: {
      in: {
        description:
          'Strength of the inward swirl that scales inversely with the radial coordinate.',
      },
      out: {
        description:
          'Strength of the outward swirl that scales with the radial coordinate.',
      },
    },
  },
  bubble2Var: {
    summary:
      'Pushes points outward by a factor that falls off with squared radius, inflating the plane like a bubble with independent x and y gains.',
    tex: 'V = (x(1+rx),\\ y(1+ry)),\\ r=\\frac{weight}{(x^2+y^2)/4+1}',
    params: {
      x: { description: 'Strength of the radial inflation along x.' },
      y: { description: 'Strength of the radial inflation along y.' },
      z: {
        description: 'Auxiliary depth parameter (unused in the planar output).',
      },
    },
  },
  bulgeVar: {
    summary:
      'Reshapes the radius by raising it to a power and renormalizing, bulging or pinching the plane radially while preserving direction.',
    tex: 'V = \\tfrac{r^{N}}{r} (x, y)',
    params: {
      N: {
        description:
          'Exponent applied to the radius that controls the strength and direction of the radial bulge.',
      },
    },
  },
  butterflyFayVar: {
    summary:
      'Draws butterfly-like curves by selecting among several coordinate formulas that pull points inward by a spread amount with an adjustable x to y ratio.',
    params: {
      curve_type: {
        description:
          'Integer selector choosing among the inward-spread coordinate formulas.',
      },
      inner_spread: {
        description: 'Amount each coordinate is pulled toward the inside.',
      },
      inner_spread_ratio: {
        description: 'Ratio scaling the x spread relative to the y spread.',
      },
      flip: { description: 'Toggle intended to flip the curve.' },
      beta: { description: 'Auxiliary shaping factor for the curve.' },
    },
  },
  bwrandsVar: {
    summary:
      'A bubble-wrap variant that maps points into a grid of cells, bubbling each cell with even and odd cells using different radius formulas and twisting by a radius-dependent angle.',
    params: {
      cellsize: { description: 'Size of each grid cell.' },
      space: {
        description: 'Gap between cells, shrinking the active bubble area.',
      },
      inner_twist: {
        description:
          'Rotation applied at the cell center, blended out toward the edge.',
      },
      outer_twist: {
        description:
          'Rotation applied at the cell edge, blended in with radius.',
      },
      angle: {
        description: 'Base rotation in degrees added to the twist angle.',
      },
    },
  },
  bwraps7Var: {
    summary:
      'Wraps points into a grid of circular bubbles, applying a gain-controlled radial squash inside each cell and twisting by a radius-dependent angle.',
    params: {
      cellsize: {
        description: 'Size of each grid cell and base radius of its bubble.',
      },
      space: {
        description:
          'Spacing factor that shrinks the bubble radius relative to the cell.',
      },
      gain: {
        description:
          'Controls the strength of the radial bubble squash inside each cell.',
      },
      inner_twist: {
        description:
          'Rotation applied at the cell center, blended out toward the edge.',
      },
      outer_twist: {
        description:
          'Rotation applied at the cell edge, blended in with radius.',
      },
    },
  },
  camouflageVar: {
    summary:
      'Scales and rotates the plane while adding a small random jitter to both coordinates, giving a noisy camouflage-like displacement.',
    params: {
      scale: { description: 'Uniform scale applied to the input coordinates.' },
      angle: {
        description: 'Rotation angle in degrees applied after scaling.',
      },
      lacunarity: {
        description:
          'Noise lacunarity parameter (declared but not used in the current map).',
      },
    },
  },
  cannabisCurveVar: {
    summary:
      'Plots the cannabis leaf polar curve, optionally filling the interior by randomly scaling the radius inward.',
    tex: 'V = r(\\sin(\\theta+\\tfrac{\\pi}{2}),\\ \\cos(\\theta+\\tfrac{\\pi}{2})),\\ \\theta=\\arctan(y/x),\\ r=(1+0.9\\cos8\\theta)(1+0.1\\cos24\\theta)(0.9+0.1\\cos200\\theta)(1+\\sin\\theta)',
    params: {
      filled: {
        description:
          'Probability of pulling a point inward to fill the leaf interior rather than tracing only its outline.',
      },
    },
  },
  cardioidVar: {
    summary:
      'Maps points onto a cardioid-shaped radius built from the squared radius plus a sine of the angle, then re-emits along the original angle.',
    tex: 'r = \\sqrt{x^2 + y^2 + \\sin(a \\theta) + 1}, V = r(\\cos\\theta, \\sin\\theta)',
    params: {
      a: {
        description:
          'Angular frequency of the sine term that shapes the cardioid lobes.',
      },
    },
  },
  cell2Var: {
    summary:
      'Divides the plane into cells and remaps each cell to a new location using separate spacing and shift parameters per quadrant, with optional random mirroring.',
    params: {
      size: { description: 'Cell size that sets the grid spacing.' },
      mirror_x: {
        description:
          'When enabled, randomly mirrors the x output of each cell.',
      },
      mirror_y: {
        description:
          'When enabled, randomly mirrors the y output of each cell.',
      },
      a: {
        description:
          'Scale factor combined with size to set the inverse cell size used for indexing.',
      },
      space_ya: {
        description: 'Y spacing for cells in the upper-right quadrant.',
      },
      space_xa: {
        description: 'X spacing for cells in the upper-right quadrant.',
      },
      space_yb: {
        description: 'Y spacing for cells in the upper-left quadrant.',
      },
      space_xb: {
        description: 'X spacing for cells in the upper-left quadrant.',
      },
      shift_xa: {
        description: 'X shift for cells in the upper-left quadrant.',
      },
      space_yc: {
        description: 'Y spacing for cells in the lower-right quadrant.',
      },
      shift_ya: {
        description: 'Y shift for cells in the lower-right quadrant.',
      },
      space_xc: {
        description: 'X spacing for cells in the lower-right quadrant.',
      },
      space_yd: {
        description: 'Y spacing for cells in the lower-left quadrant.',
      },
      shift_yb: {
        description: 'Y shift for cells in the lower-left quadrant.',
      },
      space_xd: {
        description: 'X spacing for cells in the lower-left quadrant.',
      },
      shift_xb: {
        description: 'X shift for cells in the lower-left quadrant.',
      },
    },
  },
  chaosCubesVar: {
    summary:
      'Runs an iterated function system in 3D that randomly contracts toward cube subdivisions or vertices, with optional rotation, twist, Julia feedback, and spherical inversion, projecting the result to the plane.',
    params: {
      mode: {
        description:
          'Selects the iteration rule set; mode 7 randomly mixes two sub-modes per step.',
      },
      mode7_A: {
        description: 'First sub-mode chosen at random when mode is 7.',
      },
      mode7_B: {
        description: 'Second sub-mode chosen at random when mode is 7.',
      },
      depth: { description: 'Number of iteration steps performed.' },
      twistX: {
        description:
          'Per-step twist around the x axis proportional to the current x.',
      },
      twistY: { description: 'Twist factor around the y axis.' },
      twistZ: { description: 'Twist factor around the z axis.' },
      scaleX: {
        description:
          'Contraction factor along x used in the cube subdivision step.',
      },
      scaleY: {
        description:
          'Contraction factor along y, also scaling the vertex z offset.',
      },
      scaleZ: {
        description:
          'Contraction factor along z used in the cube subdivision step.',
      },
      offset: {
        description:
          'Magnitude of the per-step translation toward subdivisions or vertices.',
      },
      rotX: {
        description:
          'Initial rotation in degrees around the x axis applied before iterating.',
      },
      rotY: {
        description:
          'Initial rotation in degrees around the y axis applied before iterating.',
      },
      rotZ: {
        description:
          'Initial rotation in degrees around the z axis applied before iterating.',
      },
      invert: { description: 'Inversion toggle for the cube rule.' },
      julia: {
        description:
          'When enabled, adds the original point back each step for Julia-style feedback.',
      },
      sphereInvert: {
        description:
          'When enabled, applies a spherical inversion to the final point.',
      },
      sphereRadius: {
        description: 'Radius used by the spherical inversion step.',
      },
    },
  },
  checksVar: {
    summary:
      'Tiles space into a checkerboard whose cells are offset alternately by the X and Y parameters, with a randomized jitter applied to the in-between cells. Produces a grid of staggered, partly noisy blocks.',
    params: {
      x: {
        description:
          'Horizontal offset applied to cells, used directly on odd cells and negated on even cells.',
      },
      y: {
        description:
          'Vertical offset applied to cells, used directly on even cells and negated on odd cells.',
      },
      size: {
        description:
          'Inverse cell scale; larger values make the checkerboard squares smaller by raising the rounding frequency.',
      },
      rnd: {
        description:
          'Amount of random jitter added to the offsets, softening the otherwise rigid grid.',
      },
    },
  },
  chunkVar: {
    summary:
      'Evaluates a general quadratic form in the input point and keeps or discards the point depending on which side of the resulting curve it falls. Mode chooses whether the inside or the outside region is kept.',
    params: {
      a: {
        description: 'Coefficient of the x squared term in the quadratic form.',
      },
      b: {
        description:
          'Coefficient of the x times y cross term in the quadratic form.',
      },
      c: {
        description: 'Coefficient of the y squared term in the quadratic form.',
      },
      d: {
        description: 'Coefficient of the linear x term in the quadratic form.',
      },
      e: {
        description: 'Coefficient of the linear y term in the quadratic form.',
      },
      f: { description: 'Constant offset added to the quadratic form.' },
      mode: {
        description:
          'Selects which side of the curve passes through; near zero keeps the region where the form is non-positive, near one keeps the region where it is positive.',
      },
    },
  },
  circleLinearVar: {
    summary:
      'Folds the plane into a grid of cells and, within each cell, conditionally bends points toward a randomly sized circle using hashed per-cell noise. Densities and reverse control which points are affected and how.',
    params: {
      sc: {
        description:
          'Cell scale that sets the size of the repeating grid and the base circle radius.',
      },
      k: {
        description:
          'Blend factor between leaving points near the cell center and pushing them onto the circle boundary.',
      },
      dens1: {
        description:
          'Primary density threshold gating whether a point inside a circle gets transformed at all.',
      },
      dens2: {
        description:
          'Secondary density factor multiplied with dens1 to pick between the two bending modes.',
      },
      reverse: {
        description:
          'Flips the comparison that chooses the bending mode, inverting the inside and outside behavior.',
      },
      seed: {
        description:
          'Offsets the per-cell hash so the random circle placement and selection change.',
      },
    },
  },
  circleRandVar: {
    summary:
      'Resamples random points within a rectangular region, folding each into a grid of cells and keeping only those that land inside a hashed per-cell circle. The accepted offset is added to the input point.',
    params: {
      sc: {
        description:
          'Cell scale that sets the size of the repeating grid and the base circle radius.',
      },
      dens: {
        description:
          'Density threshold controlling how likely a candidate cell is to be accepted.',
      },
      x: {
        description:
          'Half-width of the rectangular region from which candidate points are sampled.',
      },
      y: {
        description:
          'Half-height of the rectangular region from which candidate points are sampled.',
      },
      seed: {
        description:
          'Offsets the per-cell hash so the random acceptance pattern changes.',
      },
    },
  },
  circlesplitVar: {
    summary:
      'Leaves points inside an inner radius unchanged and pushes points outside it radially outward by the split distance. Creates a circular gap or ring discontinuity in the output.',
    tex: 'V = (\\cos(\\theta)(r+s), \\sin(\\theta)(r+s)),\\ r \\geq radius - s',
    params: {
      radius: {
        description:
          'Radius of the inner region whose points pass through untouched.',
      },
      split: {
        description:
          'Distance by which outer points are displaced radially, setting the width of the split.',
      },
    },
  },
  circlize2Var: {
    summary:
      'Maps the square-shaped contours of the plane onto circular contours by computing a side length and a perimeter coordinate, then converting them to polar form. Hole shifts the resulting radius.',
    params: {
      hole: {
        description:
          'Radial offset added to the mapped radius, opening or closing a hole at the center.',
      },
    },
  },
  circlizeVar: {
    summary:
      'Maps square-shaped contours of the plane onto circular contours, scaling the radius by four over pi so unit squares become unit circles. Hole shifts the resulting radius.',
    params: {
      hole: {
        description:
          'Radial offset added to the mapped radius, opening or closing a hole at the center.',
      },
    },
  },
  circular2Var: {
    summary:
      'Rotates each point about the origin by a pseudo-random angle derived from a hash of its coordinates combined with a uniform random value. The xx and yy parameters set the hash frequencies.',
    params: {
      angle: {
        description:
          'Maximum rotation angle in degrees that scales the random rotation magnitude.',
      },
      seed: {
        description:
          'Phase added inside the hash so the rotation pattern shifts.',
      },
      xx: {
        description: 'Frequency multiplier on x inside the coordinate hash.',
      },
      yy: {
        description: 'Frequency multiplier on y inside the coordinate hash.',
      },
    },
  },
  circularVar: {
    summary:
      'Rotates each point about the origin by a pseudo-random angle derived from a fixed hash of its coordinates combined with a uniform random value. A simpler fixed-frequency variant of circular2.',
    params: {
      angle: {
        description:
          'Maximum rotation angle in degrees that scales the random rotation magnitude.',
      },
      seed: {
        description:
          'Phase added inside the hash so the rotation pattern shifts.',
      },
    },
  },
  circusVar: {
    summary:
      'Rescales the radius depending on whether the point lies inside or outside the unit circle, shrinking one region and expanding the other to create a discontinuity at radius one.',
    tex: 'V = r\\,s\\,(\\cos\\theta,\\ \\sin\\theta),\\ s = scale\\ (r\\le1),\\ s = 1/scale\\ (r>1)',
    params: {
      scale: {
        description:
          'Scale factor applied to radii inside the unit circle; its reciprocal is applied outside, producing a pinch at radius one.',
      },
    },
  },
  cliffordVar: {
    summary:
      'Applies the Clifford attractor map, replacing the point with a pair of sine and cosine terms of its coordinates. The four coefficients shape the resulting attractor.',
    tex: 'V = (\\sin(a y) + c\\cos(a x),\\ \\sin(b x) + d\\cos(b y))',
    params: {
      a: {
        description:
          'Frequency coefficient for the sine of y and the cosine of x in the x output.',
      },
      b: {
        description:
          'Frequency coefficient for the sine of x and the cosine of y in the y output.',
      },
      c: { description: 'Amplitude of the cosine of x term in the x output.' },
      d: { description: 'Amplitude of the cosine of y term in the y output.' },
    },
  },
  collideoscopeVar: {
    summary:
      'A kaleidoscopic mirror that folds the angular coordinate into num wedges, alternately reflecting and offsetting adjacent wedges while preserving radius. The a parameter offsets the wedge angle.',
    params: {
      a: {
        description:
          'Angular offset applied within each wedge, controlling the rotation of the mirrored slices.',
      },
      num: {
        description:
          'Number of kaleidoscope wedges the angular range is divided into.',
      },
    },
  },
  coneVar: {
    summary:
      'Projects points onto a cone-like surface, combining a warped inverse radius with a randomly stepped angle and separate wave frequencies for the x and y outputs. Produces concentric ridged shells.',
    params: {
      radius1: {
        description:
          'Scales the angular coordinate before the wave functions are applied.',
      },
      radius2: {
        description:
          'Scales the random integer angular step, spreading rings apart.',
      },
      size1: {
        description:
          'Added inside the radius denominator to soften the singularity at the origin.',
      },
      size2: { description: 'Overall multiplier on the computed radius.' },
      ywave: {
        description: 'Frequency of the sine wave that drives the y output.',
      },
      xwave: {
        description: 'Frequency of the cosine wave that drives the x output.',
      },
      height: { description: 'Cone height parameter included in the struct.' },
      warp: {
        description:
          'Anisotropic weighting on the x squared term in the radius denominator, stretching the cone.',
      },
      weight: {
        description:
          'Caps the random integer count used when choosing the discrete angular step.',
      },
    },
  },
  conicVar: {
    summary:
      'Maps points onto a conic section whose shape is set by an eccentricity, with a random factor and a holes offset modulating the radius. Yields ellipse, parabola, or hyperbola style figures.',
    params: {
      eccentricity: {
        description:
          'Eccentricity of the conic section, selecting between elliptical, parabolic, and hyperbolic forms.',
      },
      holes: {
        description:
          'Subtracted from the random factor, carving holes or gaps into the figure.',
      },
    },
  },
  cornersVar: {
    summary:
      'Pushes points toward the four corners by raising the squared coordinates to tunable powers, with separate multipliers and offsets per axis and an optional logarithmic mode. Signs follow the original quadrant.',
    params: {
      x: {
        description:
          'Horizontal offset added to or subtracted from the transformed x depending on its sign.',
      },
      y: {
        description:
          'Vertical offset added to or subtracted from the transformed y depending on its sign.',
      },
      mult_x: { description: 'Multiplier on the transformed x magnitude.' },
      mult_y: { description: 'Multiplier on the transformed y magnitude.' },
      x_power: { description: 'Exponent applied to the squared x coordinate.' },
      y_power: { description: 'Exponent applied to the squared y coordinate.' },
      xy_power_add: {
        description: 'Common bias added to both axis exponents.',
      },
      log_mode: {
        description:
          'When nonzero, switches the magnitude curve to a logarithmic mapping instead of a power one.',
      },
      log_base: {
        description: 'Base of the logarithm used when log mode is active.',
      },
    },
  },
  cos2_bsVar: {
    summary:
      'A breaking-symmetry variant of the complex cosine, with independent frequency multipliers on the x and y inputs to each trigonometric and hyperbolic factor.',
    tex: 'V = (\\cos(x_2 x)\\cosh(y_2 y),\\ -\\sin(x_1 x)\\sinh(y_1 y))',
    params: {
      x1: { description: 'Frequency multiplier on x inside the sine factor.' },
      x2: {
        description: 'Frequency multiplier on x inside the cosine factor.',
      },
      y1: {
        description:
          'Frequency multiplier on y inside the hyperbolic sine factor.',
      },
      y2: {
        description:
          'Frequency multiplier on y inside the hyperbolic cosine factor.',
      },
    },
  },
  cosh2_bsVar: {
    summary:
      'A breaking-symmetry variant of the complex hyperbolic cosine, with independent frequency multipliers on the x and y inputs to each trigonometric and hyperbolic factor.',
    tex: 'V = (\\cosh(x_2 x)\\cos(y_2 y),\\ \\sinh(x_1 x)\\sin(y_1 y))',
    params: {
      x1: {
        description:
          'Frequency multiplier on x inside the hyperbolic sine factor.',
      },
      x2: {
        description:
          'Frequency multiplier on x inside the hyperbolic cosine factor.',
      },
      y1: { description: 'Frequency multiplier on y inside the sine factor.' },
      y2: {
        description: 'Frequency multiplier on y inside the cosine factor.',
      },
    },
  },
  cot2_bsVar: {
    summary:
      'A breaking-symmetry variant of the complex cotangent, dividing the trigonometric numerator by a hyperbolic denominator with independent frequency multipliers per factor.',
    tex: 'V = \\tfrac{1}{\\cosh(y_2 y) - \\cos(x_2 x)}(\\sin(x_1 x),\\ -\\sinh(y_1 y))',
    params: {
      x1: { description: 'Frequency multiplier on x inside the sine factor.' },
      x2: {
        description: 'Frequency multiplier on x inside the cosine factor.',
      },
      y1: {
        description:
          'Frequency multiplier on y inside the hyperbolic sine factor.',
      },
      y2: {
        description:
          'Frequency multiplier on y inside the hyperbolic cosine factor.',
      },
    },
  },
  coth2_bsVar: {
    summary:
      'A breaking-symmetry variant of the complex hyperbolic cotangent, dividing the hyperbolic and trigonometric numerators by a hyperbolic-minus-trigonometric denominator with independent frequency multipliers.',
    tex: 'V = \\tfrac{1}{\\cosh(x_2 x) - \\cos(y_2 y)}(\\sinh(x_1 x),\\ \\sin(y_1 y))',
    params: {
      x1: {
        description:
          'Frequency multiplier on x inside the hyperbolic sine factor.',
      },
      x2: {
        description:
          'Frequency multiplier on x inside the hyperbolic cosine factor.',
      },
      y1: { description: 'Frequency multiplier on y inside the sine factor.' },
      y2: {
        description: 'Frequency multiplier on y inside the cosine factor.',
      },
    },
  },
  cpow2Var: {
    summary:
      'A complex power variant that raises the point, treated as a complex number, to a complex exponent while randomly choosing among angular branches and divisor sectors. Produces spiral, multi-armed structures.',
    params: {
      r: {
        description:
          'Magnitude of the complex exponent, controlling overall spiral tightness.',
      },
      a: {
        description:
          'Phase of the complex exponent as a fraction of a right angle, setting the spiral twist.',
      },
      divisor: {
        description:
          'Number of rotational sectors among which the output angle is randomly placed.',
      },
      range: {
        description:
          'Number of angular branches sampled when randomly extending the input angle.',
      },
    },
  },
  crobVar: {
    summary:
      'Confines points to a rectangle defined by four edges, optionally blurring those that fall outside by scattering them near the borders with a directional bias. Without blur, outside points collapse to the origin.',
    params: {
      top: {
        description:
          'One vertical edge of the bounding rectangle; swapped automatically if it crosses the bottom.',
      },
      bottom: {
        description: 'The other vertical edge of the bounding rectangle.',
      },
      left: {
        description:
          'One horizontal edge of the bounding rectangle; swapped automatically if it crosses the right.',
      },
      right: {
        description: 'The other horizontal edge of the bounding rectangle.',
      },
      blur: {
        description:
          'When enabled, scatters outside points near the borders instead of dropping them to the origin.',
      },
      ratioBlur: {
        description:
          'Fractional margin and scatter width relative to the smaller half-interval of the rectangle.',
      },
      directBlur: {
        description:
          'Exponent shaping the directional falloff of the blur, concentrating scattered points toward the edges.',
      },
    },
  },
  csc2_bsVar: {
    summary:
      'A breaking-symmetry variant of the complex cosecant, dividing trigonometric and hyperbolic products by a hyperbolic-minus-cosine denominator with independent frequency multipliers per factor.',
    tex: 'V = \\tfrac{2}{\\cosh(2y) - \\cos(2x)}(\\sin(x_1 x)\\cosh(y_2 y),\\ -\\cos(x_2 x)\\sinh(y_1 y))',
    params: {
      x1: { description: 'Frequency multiplier on x inside the sine factor.' },
      x2: {
        description: 'Frequency multiplier on x inside the cosine factor.',
      },
      y1: {
        description:
          'Frequency multiplier on y inside the hyperbolic sine factor.',
      },
      y2: {
        description:
          'Frequency multiplier on y inside the hyperbolic cosine factor.',
      },
    },
  },
  cscSquaredVar: {
    summary:
      'Scales each coordinate by a factor built from the square of a cosecant-like term in x plus a pi offset, raised to a power and biased. The y axis gets an additional independent scale.',
    tex: 'V = w(x f,\\ \\mathrm{scale\\_y}\\,y f),\\ f = (c^2 + \\mathrm{pi\\_mult}\\,\\pi)^{\\mathrm{csc\\_pow}} + \\mathrm{csc\\_add},\\ c = \\tfrac{\\mathrm{csc\\_div}}{\\cos(x/\\mathrm{cos\\_div})\\tan(x/\\mathrm{tan\\_div})}',
    params: {
      csc_div: {
        description:
          'Numerator of the cosecant-like term, scaling its overall magnitude.',
      },
      cos_div: {
        description:
          'Divisor applied to x inside the cosine factor of the cosecant term.',
      },
      tan_div: {
        description:
          'Divisor applied to x inside the tangent factor of the cosecant term.',
      },
      csc_pow: {
        description:
          'Exponent applied to the squared cosecant term plus pi offset.',
      },
      pi_mult: {
        description: 'Multiplier on pi added before the power is taken.',
      },
      csc_add: { description: 'Constant added to the final scale factor.' },
      scale_y: {
        description: 'Additional scale applied only to the y output.',
      },
    },
  },
  csch2_bsVar: {
    summary:
      'A breaking-symmetry variant of the complex hyperbolic cosecant, dividing hyperbolic and trigonometric products by a hyperbolic-minus-cosine denominator with independent frequency multipliers per factor.',
    tex: 'V = \\tfrac{2w}{d}(\\sinh(x1\\,x)\\cos(y2\\,y),\\ -\\cosh(x2\\,x)\\sin(y1\\,y)),\\ d = \\cosh(2x) - \\cos(2y)',
    params: {
      x1: {
        description:
          'Frequency multiplier on x inside the hyperbolic sine factor.',
      },
      x2: {
        description:
          'Frequency multiplier on x inside the hyperbolic cosine factor.',
      },
      y1: { description: 'Frequency multiplier on y inside the sine factor.' },
      y2: {
        description: 'Frequency multiplier on y inside the cosine factor.',
      },
    },
  },
  csinVar: {
    summary:
      'Applies the complex sine to the point treated as a complex number, after stretching both coordinates by a common factor. The real and imaginary parts become the new x and y.',
    tex: 'V = (\\sin(s x)\\cosh(s y),\\ \\cos(s x)\\sinh(s y))',
    params: {
      stretch: {
        description:
          'Common factor scaling both coordinates before the complex sine is applied.',
      },
    },
  },
  curveVar: {
    summary:
      'Adds Gaussian bumps to each axis, displacing x by a bell curve over y and y by a bell curve over x. The amplitudes and lengths control how tall and how wide each bump is.',
    tex: 'V = (x + xamp \\cdot e^{-y^2 / xlength^2},\\ y + yamp \\cdot e^{-x^2 / ylength^2})',
    params: {
      xamp: {
        description:
          'Amplitude of the Gaussian bump added to the x coordinate.',
      },
      yamp: {
        description:
          'Amplitude of the Gaussian bump added to the y coordinate.',
      },
      xlength: {
        description:
          'Width of the x-axis bump; larger values spread the curve out (squared and floored to avoid division by zero).',
      },
      ylength: {
        description:
          'Width of the y-axis bump; larger values spread the curve out (squared and floored to avoid division by zero).',
      },
    },
  },
  dSphericalVar: {
    summary:
      'A randomized spherical inversion. With probability set by weight the point is inverted through the unit circle (divided by its squared radius), otherwise it passes through unchanged.',
    params: {
      weight: {
        description:
          'Probability that the spherical inversion is applied rather than leaving the point untouched.',
      },
    },
  },
  devilWarpVar: {
    summary:
      'Warps each point radially by a power-law expression mixing its squared coordinates with an inverse-square term. The resulting displacement is clamped between a minimum and maximum radius and scaled by an effect strength.',
    tex: 'V = w(x(1+e),\\ y(1+e)),\\ e = \\mathrm{effect}\\,\\mathrm{clamp}(|r|, \\mathrm{rmin}, \\mathrm{rmax}),\\ r = (x^2 + \\tfrac{b\\,y^2}{x^2+y^2})^{\\mathrm{warp}} - (y^2 + \\tfrac{a\\,x^2}{x^2+y^2})^{\\mathrm{warp}}',
    params: {
      a: {
        description:
          'Weights the contribution of the x term under the second power expression.',
      },
      b: {
        description:
          'Weights the contribution of the y term under the first power expression.',
      },
      effect: {
        description:
          'Overall strength of the radial displacement applied to the point.',
      },
      warp: {
        description:
          'Exponent applied to the two coordinate expressions, controlling the curvature of the warp.',
      },
      rmin: {
        description: 'Lower clamp on the computed displacement magnitude.',
      },
      rmax: {
        description: 'Upper clamp on the computed displacement magnitude.',
      },
    },
  },
  disc2Var: {
    summary:
      'A rotating disc variation that maps the polar angle into radial spokes while twisting the angle by sine and cosine offsets. Large twist values wrap around and are scaled by a winding factor.',
    tex: 'V = w\\tfrac{\\theta}{\\pi}(\\sin t + c_a,\\ \\cos t + s_a),\\ t = \\mathrm{rot}\\,\\pi(x+y),\\ s_a = \\sin(\\mathrm{twist}),\\ c_a = \\cos(\\mathrm{twist}) - 1',
    params: {
      rot: {
        description:
          'Rotation rate; multiplies pi times the sum of x and y to set the spoke frequency.',
      },
      twist: {
        description:
          'Adds a sine and cosine offset that twists the disc; magnitudes beyond a full turn are wrapped and amplified.',
      },
    },
  },
  disc3Var: {
    summary:
      'A flexible disc variation that builds a radius from the polar angle and combines sine and cosine of a scaled distance term, each component independently weighted by its own coefficients.',
    tex: 'V = w\\,h\\,r(a\\sin\\rho,\\ b\\cos\\rho),\\ \\rho = \\pi\\sqrt{d e\\,x^2 + f g\\,y^2},\\ r = \\tfrac{c}{\\pi}\\arctan(y/x)',
    params: {
      a: { description: 'Scales the sine component of the output.' },
      b: { description: 'Scales the cosine component of the output.' },
      c: {
        description:
          'Scales the angular radius term derived from the polar angle.',
      },
      d: {
        description:
          'Weights the x contribution inside the radial distance under the square root.',
      },
      e: {
        description:
          'Further weights the x contribution inside the radial distance.',
      },
      f: {
        description:
          'Weights the y contribution inside the radial distance under the square root.',
      },
      g: {
        description:
          'Further weights the y contribution inside the radial distance.',
      },
      h: { description: 'Common scale applied to both output components.' },
    },
  },
  dragonVar: {
    summary:
      'A dragon-curve style iterated affine map. Each point is sent through one of two half-scale transforms depending on the sign of x, producing a self-similar fractal fold.',
    params: {
      iterations: {
        description:
          'Nominal iteration count from the editor; the transform itself applies a single fold per call regardless of this value.',
      },
    },
  },
  eModVar: {
    summary:
      'An elliptic modulus variation. The point is mapped into elliptic coordinates and, when its modulus falls within a band, that modulus is wrapped modulo a doubled radius with a distance offset before mapping back.',
    params: {
      radius: {
        description:
          'Half-width of the elliptic modulus band and the period over which the modulus is wrapped.',
      },
      distance: {
        description:
          'Offset (scaled by radius) added when folding the modulus, shifting the wrapped position.',
      },
    },
  },
  eMotionVar: {
    summary:
      'An elliptic motion variation. The point is converted to elliptic coordinates, then the angle is rotated and the modulus is pushed in or out depending on the sign of the rotated angle.',
    params: {
      offset: {
        description:
          'Amount (times pi) the elliptic modulus is shifted, with sign depending on the angle, creating an in/out motion.',
      },
      rotate: {
        description: 'Rotation (times pi) added to the elliptic angle.',
      },
    },
  },
  ePushVar: {
    summary:
      'An elliptic push variation. The point is mapped to elliptic coordinates, its angle rotated, then its modulus scaled by a distance factor and shifted outward by a push amount.',
    params: {
      push: {
        description: 'Outward shift (times pi) added to the elliptic modulus.',
      },
      dist: {
        description:
          'Multiplier applied to the elliptic modulus, expanding or compressing it.',
      },
      rotate: {
        description: 'Rotation (times pi) added to the elliptic angle.',
      },
    },
  },
  eRotateVar: {
    summary:
      'An elliptic rotation variation. The point is mapped to elliptic coordinates and only its angle is rotated, then wrapped to the standard range before mapping back.',
    params: {
      rotate: {
        description:
          'Angle added to the elliptic angle before it is wrapped to the principal range.',
      },
    },
  },
  eScaleVar: {
    summary:
      'An elliptic scaling variation. Both the modulus and the angle of the elliptic coordinates are scaled, with the angle additionally offset and wrapped to keep it in range.',
    params: {
      scale: {
        description:
          'Multiplier applied to both the elliptic modulus and angle.',
      },
      angle: {
        description:
          'Angular offset folded into the scaled angle before wrapping.',
      },
    },
  },
  eSwirlVar: {
    summary:
      'An elliptic swirl variation. After mapping to elliptic coordinates the angle is swirled by a term proportional to the modulus plus a term inversely proportional to it.',
    params: {
      in_: {
        description:
          'Strength of the inward swirl term added inversely proportional to the elliptic modulus.',
      },
      out: {
        description:
          'Strength of the outward swirl term added proportional to the elliptic modulus.',
      },
    },
  },
  eclipseVar: {
    summary:
      'An eclipse variation. Points inside an elliptical region keep their y, but their x is reflected when a shifted x crosses the region boundary; points outside are left unchanged.',
    params: {
      shift: {
        description:
          'Horizontal shift (scaled by weight) applied to x when testing whether the point crosses the eclipse boundary.',
      },
    },
  },
  ejuliaVar: {
    summary:
      'A generalized elliptic Julia variation. The point is mapped to elliptic coordinates and both the modulus and angle are scaled by half the power, supporting negative powers via an inversion first.',
    params: {
      power: {
        description:
          'Exponent applied to the elliptic coordinates; negative values invert the point first, and the magnitude is halved when scaling.',
      },
    },
  },
  elliptic2Var: {
    summary:
      'A heavily parameterized elliptic mapping. The x output comes from an arctangent of two coefficient-weighted terms plus an angular phase, and the y output is a randomly signed logarithm, with many coefficients tuning the intermediate quantities.',
    params: {
      a1: {
        description:
          'Constant added inside the radial expression before the square roots.',
      },
      a2: {
        description: 'Scales the normalized x ratio fed into the arctangent.',
      },
      a3: {
        description: 'Sets the angular phase offset added to the x output.',
      },
      b1: {
        description:
          'Scales the x term that splits the radial square-root expression.',
      },
      b2: {
        description:
          'Scales the second arctangent argument derived from the difference term.',
      },
      c: {
        description:
          'Overall scale on the elliptic radius built from the two square roots.',
      },
      d: {
        description:
          'Constant subtracted before the inner square root that forms the second arctangent argument.',
      },
      e: {
        description:
          'Probability threshold that picks between two branches for the y sign and log subtrahend.',
      },
      f: {
        description:
          'Subtrahend inside the y logarithm when the random draw is below the threshold.',
      },
      g: {
        description:
          'Subtrahend inside the y logarithm when the random draw is above the threshold.',
      },
      h: {
        description:
          'Master scale (divided by pi) applied to both output components.',
      },
    },
  },
  ellipticVar: {
    summary:
      'An elliptic variation with selectable precision modes, mapping points through arcsine or arctangent and a logarithm scaled by two over pi. Higher modes use a more numerically stable square-root expansion.',
    params: {
      mode: {
        description:
          'Selects the variant: low values use a randomly signed branch, the mid value uses the y sign, and high values switch to the stable square-root-minus-one formulation.',
      },
    },
  },
  epispiralVar: {
    summary:
      'An epispiral (rose) variation. The radius is the reciprocal of a cosine of the angle times a petal count, offset by a holes term, optionally jittered to give the petals thickness.',
    params: {
      n: {
        description:
          'Number of petals; multiplies the polar angle inside the cosine.',
      },
      thickness: {
        description:
          'When nonzero, randomizes the radius to give the rose petals fuzzy thickness; zero gives crisp curves.',
      },
      holes: {
        description:
          'Constant subtracted from the radius, opening or closing the central hole.',
      },
    },
  },
  escherVar: {
    summary:
      'An Escher-style logarithmic-spiral twist. The point is converted to log-polar form, then rotated and rescaled by a sine/cosine blend of beta times pi before exponentiating back.',
    tex: 'V = (\\cos(n) e^{m},\\ \\sin(n) e^{m}),\\ n = \\sin(\\beta\\pi)\\theta,\\ m = \\cos(\\beta\\pi)\\ln r',
    params: {
      beta: {
        description:
          'Blend angle (times pi) that mixes the rotation and scaling of the log-polar coordinates, controlling the spiral pitch.',
      },
    },
  },
  exp2_bsVar: {
    summary:
      'A complex-exponential variation. The x coordinate drives an exponential magnitude while the y coordinate drives sine and cosine factors, with separate scales on each input.',
    tex: 'V = (e^{x \\cdot x1}\\cos(y \\cdot y2),\\ e^{x \\cdot x1}\\sin(y \\cdot y1))',
    params: {
      x1: {
        description:
          'Scale on x inside the exponential, controlling the radial growth rate.',
      },
      y1: {
        description:
          'Scale on y inside the sine factor feeding the output y component.',
      },
      y2: {
        description:
          'Scale on y inside the cosine factor feeding the output x component.',
      },
    },
  },
  fdiscVar: {
    summary:
      'A flux-disc variation. An angular factor based on the inverse radius and a radius based on the polar angle are combined into a base point, then mixed through four weighted terms blending it with the original coordinates.',
    tex: 'V = w(T_1 p_x + T_2 x p_x + T_3 x \\rho + T_4 x,\\ T_1 p_y + T_2 y p_y + T_3 y \\rho + T_4 y),\\ p_x = \\rho\\cos(\\alpha + \\mathrm{xshift}),\\ p_y = \\rho\\sin(\\alpha + \\mathrm{yshift}),\\ \\alpha = \\tfrac{2\\pi}{r + \\mathrm{ashift}},\\ \\rho = \\tfrac{1}{2}(\\tfrac{\\theta}{\\pi} + \\mathrm{rshift})',
    params: {
      ashift: {
        description:
          'Added to the point length in the denominator of the angular factor, shifting the angular frequency.',
      },
      rshift: {
        description:
          'Offset added to the normalized polar angle that forms the radius.',
      },
      xshift: {
        description: 'Phase offset added inside the cosine of the x factor.',
      },
      yshift: {
        description: 'Phase offset added inside the sine of the y factor.',
      },
      term1: {
        description: 'Weight of the pure disc point in the output blend.',
      },
      term2: {
        description:
          'Weight of the disc point modulated by the original coordinate.',
      },
      term3: {
        description: 'Weight of the original coordinate times the radius.',
      },
      term4: { description: 'Weight of the unmodified original coordinate.' },
    },
  },
  fibonacci2Var: {
    summary:
      'A Fibonacci variation built from two complex exponentials whose magnitudes and angles derive from the golden-ratio logarithm, subtracted and normalized by the square root of five.',
    tex: 'V = \\tfrac{w}{\\sqrt5}(e_1\\cos a - e_2\\cos b,\\ e_1\\sin a - e_2\\sin b),\\ a = ky,\\ b = -(\\pi x + ky),\\ e_1 = \\mathrm{sc}\\,e^{\\mathrm{sc2}\\,kx},\\ e_2 = \\mathrm{sc}\\,e^{-\\mathrm{sc2}(kx - \\pi y)},\\ k = \\ln\\varphi',
    params: {
      sc: { description: 'Overall scale on both exponential radii.' },
      sc2: {
        description:
          'Scale on the exponent arguments, controlling how fast the two radii grow.',
      },
    },
  },
  floraVar: {
    summary:
      'A flower and leaf shape generator offering many distinct petal and leaf silhouettes selected by an integer type, with a fill control, scale, edge distortion, and a shape modifier that tunes each silhouette.',
    params: {
      leafType: {
        description:
          'Integer index selecting which of the many leaf or flower silhouettes is drawn.',
      },
      filled: {
        description:
          'Probability that a point is placed at a random interior radius rather than on the outline, filling the shape.',
      },
      scale: {
        description: 'Overall size multiplier applied to the generated shape.',
      },
      distort: {
        description:
          'Adds sinusoidal ripple to the coordinates, distorting the shape edges.',
      },
      shapeMod: {
        description:
          'Per-silhouette modifier that adjusts lobes, bumps, or proportions of the selected shape.',
      },
    },
  },
  flowerVar: {
    summary:
      'A flower variation. The radius is a randomly jittered rose curve, the cosine of a petal count times the angle minus a holes offset, divided by the point distance.',
    params: {
      holes: {
        description:
          'Subtracted from the random draw, opening the central hole of the flower.',
      },
      petals: {
        description:
          'Number of petals; multiplies the polar angle inside the cosine.',
      },
    },
  },
  fluxVar: {
    summary:
      'A flux variation that treats the point relative to two source points at plus and minus weight on the x axis, averaging their log-radii and angles to produce a dipole-like flow.',
    tex: 'V = R(\\cos A,\\ \\sin A),\\ R = |w(2+\\mathrm{spread})|\\sqrt{\\tfrac{\\sqrt{y^2+(x+w)^2}}{\\sqrt{y^2+(x-w)^2}}},\\ A = \\tfrac{1}{2}(\\arctan\\tfrac{y}{x-w} - \\arctan\\tfrac{y}{x+w})',
    params: {
      spread: {
        description:
          'Adjusts the radial spread of the flux field by adding to the base radius multiplier.',
      },
    },
  },
  fourthVar: {
    summary:
      'A quadrant-dependent composite variation that applies a different classic transform in each quadrant: spherical, loonie, susan, and linear.',
    params: {
      spin: { description: 'Rotation angle added in the susan quadrant.' },
      space: {
        description:
          'Spacing offset used outside the susan radius to push points outward.',
      },
      twist: {
        description:
          'Radius-dependent extra rotation applied inside the susan radius.',
      },
      x: {
        description:
          'Horizontal offset of the susan center and recentering shift.',
      },
      y: {
        description:
          'Vertical offset of the susan center and recentering shift.',
      },
    },
  },
  fresnelVar: {
    summary:
      'Computes a phase from a quadratic ramp of x plus y and maps it onto a unit circle, recalling the spiral of a Fresnel integral. The result swings around a ring as the input grows.',
    tex: 'V = w (\\cos(\\tfrac{\\pi}{2} t^2), \\sin(\\tfrac{\\pi}{2} t^2)),\\ t = \\mathrm{scale}\\,(x + y)',
    params: {
      scale: {
        description:
          'Multiplies the x plus y sum before squaring, controlling how quickly the phase winds around the circle.',
      },
    },
  },
  funnelVar: {
    summary:
      'Pushes each coordinate outward using a hyperbolic tangent times a secant term, producing a funnel-like flaring. The effect amount adds a constant phase offset to both axes.',
    tex: 'V = (x + w\\tanh(x)(\\sec x + \\mathrm{effect}\\,\\pi),\\ y + w\\tanh(y)(\\sec y + \\mathrm{effect}\\,\\pi))',
    params: {
      effect: {
        description:
          'Scaled by pi and added to the per-axis secant term, intensifying the outward funnel distortion.',
      },
    },
  },
  gingerBreadVar: {
    summary:
      'Applies one step of the Gingerbreadman map, where the new x is one minus y plus the absolute value of x and the new y is the old x. Iterating it yields the classic hexagonal Gingerbreadman attractor.',
    tex: 'V = w\\,\\mathrm{scale}\\,(1 - y + |x|,\\ x)',
    params: {
      scale: {
        description: 'Uniformly scales both output coordinates of the map.',
      },
    },
  },
  glynnSim1Var: {
    summary:
      'A Glynn-style inversion that reflects points outside a disc through a power-law radial map and, for points near a seed circle, scatters them randomly around a satellite point. It builds clustered, gravity-like swirls around the disc.',
    params: {
      radius: {
        description:
          'Radius of the main disc and the inversion strength used in the radial mapping.',
      },
      radius1: {
        description:
          'Base radius of the satellite circle where scattered points are placed.',
      },
      phi1: {
        description:
          'Angle in degrees locating the satellite circle center relative to the origin.',
      },
      thickness: {
        description:
          'Random thickness added to the satellite radius, widening the scattered ring.',
      },
      pow: {
        description:
          'Exponent applied to the radial factor when deciding whether a point passes through unchanged.',
      },
      contrast: {
        description:
          'Weights the pass-through probability, shifting the balance between inverted and unchanged points.',
      },
    },
  },
  glynnSim2Var: {
    summary:
      'A Glynn variant that inverts points outside a disc and, for inner points, places them randomly within an annular ring spanning two angular bounds. The two angles define the arc that the scattered ring covers.',
    params: {
      radius: {
        description: 'Radius of the main disc and the inversion strength.',
      },
      thickness: {
        description:
          'Width of the annular ring used when scattering inner points.',
      },
      contrast: {
        description:
          'Weights the pass-through probability versus radial inversion.',
      },
      pow: {
        description:
          'Exponent applied to the radial factor in the pass-through test.',
      },
      phi1: {
        description: 'Starting angle in degrees of the scattered annular arc.',
      },
      phi2: {
        description: 'Ending angle in degrees of the scattered annular arc.',
      },
    },
  },
  glynnSim3Var: {
    summary:
      'A Glynn variant that inverts points outside a disc and, for inner points, scatters them onto one of two concentric circles chosen randomly. The split between the two circles depends on the radius and thickness.',
    params: {
      radius: {
        description: 'Radius of the main disc and the inversion strength.',
      },
      thickness: {
        description:
          'Added to the radius to form the outer scatter circle and to set the split ratio between the two circles.',
      },
      contrast: {
        description:
          'Weights the pass-through probability versus radial inversion.',
      },
      pow: {
        description:
          'Exponent applied to the radial factor in the pass-through test.',
      },
    },
  },
  gosperVar: {
    summary:
      'Selects one of seven affine sub-transforms based on a hash of the input, mimicking the self-similar tiling of the Gosper island curve. Each branch rotates and scales toward a different hexagonal cell.',
  },
  gridVar: {
    summary:
      'Ignores the input point and samples random positions snapped to a square lattice, drawing the grid lines themselves. Points close to intersections receive a small random jitter.',
    params: {
      divisions: {
        description:
          'Number of grid cells across the sampled area; occasionally dropped to one to draw the outer frame.',
      },
      size: {
        description:
          'Half-extent of the square region in which lattice points are sampled.',
      },
      jitterNearIntersectionsDistance: {
        description:
          'Distance threshold near intersections within which points are randomly jittered.',
      },
    },
  },
  gridout2Var: {
    summary:
      'Snaps the point to integer cells and, depending on which diagonal octant the cell falls in, shifts the original coordinate along x or y. This routes points outward into a directional grid flow.',
    params: {
      a: {
        description:
          'Horizontal shift applied when the octant test selects an x displacement.',
      },
      b: {
        description:
          'Vertical shift applied when the octant test selects a y displacement.',
      },
      c: {
        description:
          'Scales the rounded x cell index used in the octant comparison.',
      },
      d: {
        description:
          'Scales the rounded y cell index used in the octant comparison.',
      },
    },
  },
  gumowskiMiraVar: {
    summary:
      'Applies one iteration of the Gumowski-Mira map, a rational nonlinearity combined with a weak cubic term. Iterating it produces intricate organic, ring-like attractors.',
    tex: "G(u) = m\\,u + \\tfrac{2(1-m)u^{2}}{1+u^{2}},\\ x' = y + a(1 - b\\,y^{2})y + G(x),\\ V = (x',\\ -x + G(x'))",
    params: {
      a: {
        description:
          'Strength of the cubic perturbation term added before the rational map.',
      },
      b: {
        description:
          'Coefficient inside the cubic term, shaping its quadratic falloff.',
      },
      m: {
        description:
          'Linear-to-nonlinear blend of the rational Mira function applied to each coordinate.',
      },
    },
  },
  harmonographVar: {
    summary:
      'Models a four-pendulum harmonograph by summing two damped sinusoids per axis at a random time sample, nudging the point by the resulting offset. This traces decaying Lissajous-style curves.',
    params: {
      time: {
        description:
          'Upper bound on the random time sample; larger values reach further into the decaying motion.',
      },
      a1: { description: 'Amplitude of the first x sinusoid.' },
      f1: { description: 'Frequency of the first x sinusoid.' },
      p1: { description: 'Phase in degrees of the first x sinusoid.' },
      d1: { description: 'Damping rate of the first x sinusoid.' },
      a2: { description: 'Amplitude of the second x sinusoid.' },
      f2: { description: 'Frequency of the second x sinusoid.' },
      p2: { description: 'Phase in degrees of the second x sinusoid.' },
      d2: { description: 'Damping rate of the second x sinusoid.' },
      a3: { description: 'Amplitude of the first y sinusoid.' },
      f3: { description: 'Frequency of the first y sinusoid.' },
      p3: { description: 'Phase in degrees of the first y sinusoid.' },
      d3: { description: 'Damping rate of the first y sinusoid.' },
      a4: { description: 'Amplitude of the second y sinusoid.' },
      f4: { description: 'Frequency of the second y sinusoid.' },
      p4: { description: 'Phase in degrees of the second y sinusoid.' },
      d4: { description: 'Damping rate of the second y sinusoid.' },
    },
  },
  henonVar: {
    summary:
      'Applies one step of the Henon map, where the new x is one minus a times x squared plus y and the new y is b times x. Iterating it yields the well-known Henon strange attractor.',
    tex: 'V = w (1 - a x^2 + y,\\ b x)',
    params: {
      a: {
        description:
          'Strength of the quadratic nonlinearity that folds the attractor.',
      },
      b: {
        description: 'Contraction factor mapping the old x into the new y.',
      },
    },
  },
  hexModulusVar: {
    summary:
      'Wraps the plane into a single hexagonal cell using cube-coordinate rounding, tiling space into a honeycomb. Each point is folded back relative to its nearest hex center.',
    params: {
      size: {
        description:
          'Sets the hexagon scale; larger values shrink the cells by enlarging the working coordinates.',
      },
    },
  },
  hilbertVar: {
    summary:
      'Performs one folding step of the Hilbert space-filling curve, mapping the point into one of four quadrants with the appropriate rotation or reflection. Repeated application traces the recursive Hilbert path.',
  },
  hole2Var: {
    summary:
      'Carves a radial hole by displacing the radius by a power-law term that grows with angle, with a selectable shape formula adding sinusoidal or other modulation. An inside flag inverts the radius to flip the hole inward.',
    params: {
      a: {
        description:
          'Exponent of the angular power-law term that sets how the displacement grows with angle.',
      },
      b: {
        description:
          'Frequency multiplier of the angle inside the shape-dependent sinusoidal terms.',
      },
      c: {
        description:
          'Scales the overall angular displacement applied to the radius.',
      },
      d: {
        description:
          'Multiplies the angle, twisting the displacement pattern around the origin.',
      },
      inside: {
        description:
          'When set, inverts the radius so the hole turns inward instead of outward.',
      },
      shape: {
        description:
          'Integer selector choosing among ten different radial displacement formulas.',
      },
    },
  },
  holeVar: {
    summary:
      'Opens a circular hole at the origin by adding an angle-dependent power-law term to the radius. The inside flag switches between pushing points outward and pulling them into the hole.',
    tex: '\\delta = (\\tfrac{\\alpha}{\\pi} + 1)^{a},\\ \\alpha = \\arctan(y/x),\\ r = \\sqrt{x^{2}+y^{2}+\\delta},\\ V = r(\\cos\\alpha,\\ \\sin\\alpha)',
    params: {
      a: {
        description:
          'Exponent of the angular power-law term controlling how strongly the hole displaces points.',
      },
      inside: {
        description:
          'When set, inverts the mapping so points are drawn inward rather than pushed outward.',
      },
    },
  },
  hopalongVar: {
    summary:
      'Applies one step of the Hopalong attractor, where the new x subtracts a signed square root of a linear term and the new y is a minus the old x. Iterating it produces sprawling, layered attractor patterns.',
    tex: 'V = (y - \\operatorname{sign}(x)\\sqrt{|b\\,x - c|},\\ a - x)',
    params: {
      a: {
        description:
          'Subtracted from x to form the new y, shifting the attractor.',
      },
      b: { description: 'Scales x inside the square-root term of the new x.' },
      c: {
        description:
          'Offset subtracted inside the square-root term of the new x.',
      },
    },
  },
  hyperbolicEllipseVar: {
    summary:
      'Maps the point through hyperbolic functions of x combined with cosine and sine of y, blending hyperbolic and elliptic coordinate behavior. It bends the plane into nested elliptic arcs.',
    tex: 'V = w (\\sinh(x)\\cos(a y),\\ \\cosh(x)\\sin(a y))',
    params: {
      a: {
        description:
          'Frequency multiplier of y inside the cosine and sine terms, setting the angular density of the arcs.',
      },
    },
  },
  hypershiftVar: {
    summary:
      'Performs a hyperbolic shift by inverting the point about the unit disc, translating by the shift, and inverting again with a conformal scale. This produces Mobius-style hyperbolic translations of the plane.',
    tex: '(x_1,y_1) = \\tfrac{(x,y)}{x^{2}+y^{2}} + (shift, 0),\\ k = \\tfrac{1 - shift^{2}}{x_1^{2}+y_1^{2}},\\ V = (k\\,x_1 + shift,\\ stretch\\,k\\,y_1)',
    params: {
      shift: {
        description:
          'Translation distance applied between the two inversions and also setting the conformal scale factor.',
      },
      stretch: {
        description:
          'Multiplies the final y component, stretching the result vertically.',
      },
    },
  },
  hypertile2Var: {
    summary:
      'Maps points into a hyperbolic tiling by contracting the radius toward the Poincare disc edge and perturbing the angle with a sinusoid. The result tiles the disc with p-fold, q-modulated cells.',
    tex: "r' = \\tfrac{r}{r+1},\\ \\theta' = \\theta + \\tfrac{2\\pi}{p}\\sin(q\\theta),\\ V = r'(\\cos\\theta',\\ \\sin\\theta')",
    params: {
      p: {
        description:
          'Sets the base angular step as two pi over p, controlling the rotational symmetry of the tiling.',
      },
      q: {
        description:
          'Frequency of the sinusoidal angle perturbation, modulating the tile distortion.',
      },
    },
  },
  hypertileVar: {
    summary:
      'Maps points into a hyperbolic tiling by rotating the angle and scaling it by a q-based sector factor, then contracting the radius toward the Poincare disc boundary. It produces a p-by-q hyperbolic tessellation.',
    tex: 'a = \\theta + \\tfrac{\\pi}{p},\\ V = \\tfrac{r}{1+r}(\\cos(\\tfrac{2\\pi}{q}a),\\ \\sin(\\tfrac{2\\pi}{q}a))',
    params: {
      p: {
        description:
          'Sets the angular offset as pi over p, controlling the rotational placement of tiles.',
      },
      q: {
        description:
          'Determines the sector scaling factor, controlling how many tiles span the disc.',
      },
    },
  },
  iconAttractorVar: {
    summary:
      'Evaluates a symmetric-icon attractor by accumulating powers of the complex input and combining them with rotation and reflection terms. It generates the dihedral, snowflake-like symmetric icon patterns.',
    params: {
      degree: {
        description:
          'Symmetry order; sets how many times the complex point is multiplied to build the rotational term.',
      },
      a: {
        description:
          'Coefficient of the squared-magnitude term in the radial factor.',
      },
      b: {
        description:
          'Coefficient of the degree-power real term added to the radial factor.',
      },
      g: {
        description:
          'Strength of the symmetric rotation term mixing the accumulated complex powers.',
      },
      o: {
        description:
          'Strength of the chirality term that breaks reflection symmetry.',
      },
      l: { description: 'Constant offset added to the radial factor.' },
    },
  },
  intersectionVar: {
    summary:
      'Randomly chooses an x-oriented or y-oriented treatment, each combining exponential tiling along one axis with a modular folding along the other. The two branches intersect to weave a crosshatched lattice.',
    params: {
      xwidth: {
        description:
          'Magnitude of the random exponential step along x in the x branch.',
      },
      xtilesize: { description: 'Scales the tiled x output in the x branch.' },
      xmod1: {
        description: 'Half-width of the folding band along y in the x branch.',
      },
      xmod2: {
        description:
          'Multiplier setting the modular period of the y folding in the x branch.',
      },
      xheight: { description: 'Scales the folded y output in the x branch.' },
      yheight: {
        description:
          'Magnitude of the random exponential step along y in the y branch.',
      },
      ytilesize: { description: 'Scales the tiled y output in the y branch.' },
      ymod1: {
        description: 'Half-width of the folding band along x in the y branch.',
      },
      ymod2: {
        description:
          'Multiplier setting the modular period of the x folding in the y branch.',
      },
      ywidth: { description: 'Scales the folded x output in the y branch.' },
    },
  },
  invCircleVar: {
    summary:
      'Inverts the point through a circle of given radius centered at (a, b), the classic geometric circle inversion. With restricted enabled, points already inside the circle are left unchanged.',
    tex: 'V = w (a + \\tfrac{R^2 (x-a)}{d^2},\\ b + \\tfrac{R^2 (y-b)}{d^2}),\\ d^2 = (x-a)^2 + (y-b)^2',
    params: {
      radius: { description: 'Radius of the inversion circle.' },
      a: { description: 'X coordinate of the inversion circle center.' },
      b: { description: 'Y coordinate of the inversion circle center.' },
      restricted: {
        description:
          'When enabled, leaves points inside the circle untouched so the chaos game can converge.',
      },
    },
  },
  invCircle2Var: {
    summary:
      'Generalizes circle inversion to use an arbitrary inversion center inside the circle, solving a ray-circle intersection to find the mapped point. Restricted mode and the no-solution case leave the point unchanged.',
    params: {
      radius: { description: 'Radius of the inversion circle.' },
      a: { description: 'X coordinate of the inversion circle center.' },
      b: { description: 'Y coordinate of the inversion circle center.' },
      cx: {
        description:
          'X coordinate of the inversion point, which may differ from the circle center.',
      },
      cy: {
        description:
          'Y coordinate of the inversion point, which may differ from the circle center.',
      },
      restricted: {
        description:
          'When enabled, leaves points inside the circle untouched so the chaos game can converge.',
      },
    },
  },
}
