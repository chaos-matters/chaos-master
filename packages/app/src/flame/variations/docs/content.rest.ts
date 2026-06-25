import type { VariationDocMap } from './types'

/**
 * Remaining utility variations: pre/post transforms, crop/cut shapes, extra
 * blur kinds, and the synth multi-wave map. Drafted from each implementation;
 * random/iterative ones are described without a `tex`. Keys + params validated
 * by docs.coverage.test.
 */
export const variationDocsRest: VariationDocMap = {
  synthVar: {
    summary:
      'A large multi-mode synthesizer variation that drives a wave-shaped modulation function (built from layered sine, cosine, square, saw, triangle and other waveforms) across one of about twenty geometric remappings such as spherical, bubble, swirl, julia, disc, rings, several blur modes and axis shifts/mirrors. The selected mode decides how the synthesized factor warps the radius or coordinates.',
    params: {
      a: {
        description:
          'Base value of the synthesized modulation function before any wave layers are applied.',
      },
      mode: {
        description:
          'Selects which geometric remapping is used (spherical, bubble, blur variants, raw axis maps, shifts, swirl, julia, disc, rings, cylinder, mirrors and more).',
      },
      power: {
        description:
          'Exponent that controls the radial falloff or strength used by most modes when computing the radius.',
      },
      mix: {
        description:
          'Blends the synthesized modulation against an unmodulated baseline of one; lower values reduce the effect.',
      },
      smoothFact: {
        description:
          'Smoothness or interpolation control, selecting linear versus Bezier interpolation and the sin/cos combination style.',
      },
      b: { description: 'Amplitude of wave layer B; zero disables the layer.' },
      b_type: {
        description:
          'Waveform type for layer B (sine, cosine, square, saw, triangle, concave, convex, ngon, ingon).',
      },
      b_skew: {
        description: 'Skews the phase ramp of layer B toward one side.',
      },
      b_frq: { description: 'Frequency multiplier for layer B.' },
      b_phs: { description: 'Phase offset for layer B.' },
      b_layer: {
        description:
          'Combination mode for layer B (add, multiply, max or min) against the running factor.',
      },
      c: { description: 'Amplitude of wave layer C; zero disables the layer.' },
      c_type: { description: 'Waveform type for layer C.' },
      c_skew: { description: 'Skews the phase ramp of layer C.' },
      c_frq: { description: 'Frequency multiplier for layer C.' },
      c_phs: { description: 'Phase offset for layer C.' },
      c_layer: {
        description:
          'Combination mode for layer C (add, multiply, max or min).',
      },
      d: { description: 'Amplitude of wave layer D; zero disables the layer.' },
      d_type: { description: 'Waveform type for layer D.' },
      d_skew: { description: 'Skews the phase ramp of layer D.' },
      d_frq: { description: 'Frequency multiplier for layer D.' },
      d_phs: { description: 'Phase offset for layer D.' },
      d_layer: {
        description:
          'Combination mode for layer D (add, multiply, max or min).',
      },
      e: { description: 'Amplitude of wave layer E; zero disables the layer.' },
      e_type: { description: 'Waveform type for layer E.' },
      e_skew: { description: 'Skews the phase ramp of layer E.' },
      e_frq: { description: 'Frequency multiplier for layer E.' },
      e_phs: { description: 'Phase offset for layer E.' },
      e_layer: {
        description:
          'Combination mode for layer E (add, multiply, max or min).',
      },
      f: { description: 'Amplitude of wave layer F; zero disables the layer.' },
      f_type: { description: 'Waveform type for layer F.' },
      f_skew: { description: 'Skews the phase ramp of layer F.' },
      f_frq: { description: 'Frequency multiplier for layer F.' },
      f_phs: { description: 'Phase offset for layer F.' },
      f_layer: {
        description:
          'Combination mode for layer F (add, multiply, max or min).',
      },
    },
  },
  cutFractalVar: {
    summary:
      'A cut variation that runs the point through an iterated absolute-value fractal map and keeps only points whose final fractal distance falls below a threshold, discarding the rest to zero. Acts as a fractal-shaped stencil over the plane.',
    params: {
      seed: { description: 'Random seed value for the variation.' },
      mode: {
        description:
          'Chooses whether to use the incoming point coordinates or freshly randomized coordinates as the fractal sample point.',
      },
      time: {
        description:
          'Animation time that shifts the fractal constant, morphing the cut shape over time.',
      },
      iters: {
        description:
          'Number of fractal iterations; more iterations sharpen and complicate the kept region.',
      },
      zoom: {
        description:
          'Scales the sample coordinates into the fractal, zooming the pattern in or out.',
      },
      invert: {
        description:
          'Inverts the keep test so the discarded and kept regions swap.',
      },
    },
  },
  cutApollonianVar: {
    summary:
      'A cut variation that folds the point through an iterated Apollonian gasket inversion and keeps only points landing in the gasket region, zeroing the rest. Produces a circle-packing shaped stencil.',
    params: {
      mode: {
        description:
          'Chooses whether to use the incoming point coordinates or freshly randomized coordinates as the sample point.',
      },
      levels: {
        description:
          'Number of inversion iterations; controls the recursion depth of the gasket.',
      },
      zoom: {
        description:
          'Scales the sample coordinates, zooming the gasket pattern.',
      },
      invert: {
        description:
          'Inverts the keep test so kept and discarded regions swap.',
      },
    },
  },
  cutCircleDesignVar: {
    summary:
      'A cut variation that tiles the plane and accumulates overlapping circle membership tests across several shrinking radii, keeping points by the parity of the resulting design and zeroing the rest. Produces an animated interlocking-circle stencil.',
    params: {
      seed: { description: 'Random seed value for the variation.' },
      mode: {
        description:
          'Chooses whether to use the incoming point coordinates or freshly randomized coordinates as the sample point.',
      },
      time: {
        description:
          'Animation time that scrolls the tiling and modulates the per-iteration radii.',
      },
      zoom: {
        description:
          'Scales the sample coordinates, controlling the density of the tiled circle pattern.',
      },
      invert: {
        description:
          'Inverts the keep test so kept and discarded regions swap.',
      },
    },
  },
  pixelFlowVar: {
    summary:
      'A direct-color flow variation that quantizes the plane into blocks and nudges each point a small distance along a fixed angle, scaled by a per-block hashed magnitude and a quartic fade. It returns only the flow delta, so it is meant to be paired with a linear variation.',
    params: {
      angle: {
        description: 'Direction in radians along which points are pushed.',
      },
      len: { description: 'Maximum flow distance applied along the angle.' },
      width: {
        description:
          'Block resolution; higher values produce finer flow blocks.',
      },
      seed: {
        description:
          'Seed feeding the per-block hash, changing the flow pattern.',
      },
    },
  },
  blurZoomVar: {
    summary:
      'A blur variation that randomly scales each point away from a fixed center, smearing the image radially outward like a zoom blur.',
    tex: 'z = 1 + \\text{length} \\cdot \\text{rand}(),\\quad V = ((x - x_0) z + x_0,\\ (y + y_0) z - y_0)',
    params: {
      length: {
        description:
          'Strength of the random zoom; larger values smear points further from the center.',
      },
      x: { description: 'X coordinate of the zoom center.' },
      y: { description: 'Y coordinate of the zoom center.' },
    },
  },
  blurLinearVar: {
    summary:
      'A blur variation that, in this implementation, simply passes the point through scaled by the weight; the length and angle parameters are present but not applied in the shader.',
    params: {
      length: {
        description:
          'Intended blur length (not applied in the current shader).',
      },
      angle: {
        description:
          'Intended blur direction (not applied in the current shader).',
      },
    },
  },
  radialBlurVar: {
    summary:
      'A blur variation that rotates each point about the origin by a random angular amount and blends radial and inward motion, smearing the image around and toward the center. The blur angle sets the balance between rotational and radial spread.',
    params: {
      angle: {
        description:
          'Controls the mix between rotational (tangential) and radial blur via its sine and cosine.',
      },
    },
  },
  blurPixelizeVar: {
    summary:
      'A blur variation that snaps each point to the center of its square grid cell and then jitters it uniformly within the cell, producing a pixelated, blocky blur.',
    params: {
      size: {
        description:
          'Edge length of the square grid cell points are snapped to.',
      },
      scale: {
        description: 'Widens or narrows the random jitter within each cell.',
      },
    },
  },
  starBlurVar: {
    summary:
      'A blur variation that scatters points uniformly inside a star-polygon shape, filling a many-pointed star with random samples.',
    params: {
      power: {
        description:
          'Number of star points; also sets the angular sector size.',
      },
      range: {
        description:
          'Controls the depth of the star indentations, shaping how pointed the star is.',
      },
    },
  },
  cropCrossVar: {
    summary:
      'A crop variation that keeps points lying within a plus or cross shape formed by two crossing rectangular bars, zeroing everything outside. The shape can be rotated.',
    params: {
      width: { description: 'Thickness of the two crossing bars.' },
      length: { description: 'Length of the cross arms.' },
      angle: { description: 'Rotation of the cross shape.' },
    },
  },
  cropBoxVar: {
    summary:
      'A crop variation that keeps points inside an axis-aligned rectangle. Points outside are either zeroed or randomly relocated to a band just inside the rectangle edge, depending on the zero flag.',
    params: {
      left: {
        description:
          'Left edge of the box (swapped automatically with right if larger).',
      },
      right: { description: 'Right edge of the box.' },
      top: { description: 'Top edge of the box.' },
      bottom: { description: 'Bottom edge of the box.' },
      zero: {
        description:
          'When set, points outside the box are zeroed; otherwise they are scattered just inside the edge.',
      },
    },
  },
  cropTriangleVar: {
    summary:
      'A crop variation that keeps points inside an upward equilateral triangle and zeroes everything outside. The triangle can be rotated.',
    params: {
      size: { description: 'Edge length of the triangle.' },
      angle: { description: 'Rotation of the triangle.' },
    },
  },
  cropRhombusVar: {
    summary:
      'A crop variation that keeps points inside a diamond or rhombus defined by a width and height, using the sum of normalized absolute coordinates, and zeroes the rest. The shape can be rotated.',
    tex: 'd = \\frac{|x|}{w/2} + \\frac{|y|}{h/2},\\quad \\text{keep if } d \\le 1',
    params: {
      width: { description: 'Full horizontal extent of the rhombus.' },
      height: { description: 'Full vertical extent of the rhombus.' },
      angle: { description: 'Rotation of the rhombus.' },
    },
  },
  cropStarsVar: {
    summary:
      'A crop variation that keeps points inside a star polygon whose boundary radius oscillates between an inner and outer value across each angular sector, zeroing points outside the star.',
    params: {
      points: { description: 'Number of star points.' },
      inner: { description: 'Inner radius at the star valleys.' },
      outer: { description: 'Outer radius at the star tips.' },
    },
  },
  cropPolygonVar: {
    summary:
      'A crop variation that keeps points inside a regular polygon by comparing each point radius to the polygon edge distance for its angular sector, zeroing points outside. The polygon can be rotated.',
    params: {
      sides: { description: 'Number of polygon sides.' },
      radius: { description: 'Circumradius controlling the polygon size.' },
      angle: { description: 'Rotation of the polygon.' },
    },
  },
  symNetG10Var: {
    summary:
      'A post symmetry variation that randomly applies one of four wallpaper-group transforms (reflections and quarter-turn rotations with x/y spacing offsets), replicating the point into a square network pattern.',
    params: {
      space: {
        description: 'General spacing parameter for the symmetry network.',
      },
      spacex: {
        description:
          'Horizontal spacing offset applied to the mirrored copies.',
      },
      spacey: {
        description: 'Vertical spacing offset applied to the rotated copies.',
      },
    },
  },
  symBandG2Var: {
    summary:
      'A post symmetry variation that randomly chooses between a shifted copy and a vertically flipped, shifted copy, replicating the point into a two-element frieze band.',
    params: {
      stepx: { description: 'Horizontal step between band copies.' },
      stepy: { description: 'Vertical step between band copies.' },
    },
  },
  symNetG9Var: {
    summary:
      'A post symmetry variation that randomly applies one of four reflection transforms across x and y with separation offsets, replicating the point into a rectangular symmetry network.',
    params: {
      sepx: {
        description: 'Horizontal separation offset between reflected copies.',
      },
      sepy: {
        description: 'Vertical separation offset between reflected copies.',
      },
    },
  },
  symNetG16Var: {
    summary:
      'A post symmetry variation that randomly applies one of twelve transforms (six sixfold rotations each in two sign variants) with a radial offset and x/y steps, replicating the point into a hexagonal symmetry network.',
    params: {
      radius: {
        description: 'Radial offset applied to every copy before transforming.',
      },
      stepx: { description: 'Horizontal step offset added per copy.' },
      stepy: { description: 'Vertical step offset added per copy.' },
    },
  },
  postCircleCropVar: {
    summary:
      'A post variation that crops points to a circle of given radius and center. Points outside are either zeroed or, when zero is off, scattered onto the circle boundary using a random scatter area.',
    params: {
      radius: { description: 'Radius of the cropping circle.' },
      x: { description: 'X coordinate of the circle center.' },
      y: { description: 'Y coordinate of the circle center.' },
      scatter_area: {
        description:
          'Random radial spread applied to escaped points placed on the circle boundary.',
      },
      zero: {
        description:
          'When set, points outside the circle are zeroed; otherwise they are scattered onto the boundary.',
      },
    },
  },
  postMirrorWfVar: {
    summary:
      'A post variation that, with fifty percent probability per enabled axis, mirrors the point across the x and/or y axis with optional per-axis shift and scale. Used to create mirrored symmetry after the affine.',
    params: {
      xaxis: { description: 'Enables random mirroring across the x axis.' },
      yaxis: { description: 'Enables random mirroring across the y axis.' },
      xshift: {
        description:
          'Shift applied to the x coordinate when mirroring across the x axis.',
      },
      yshift: {
        description:
          'Shift applied to the y coordinate when mirroring across the y axis.',
      },
      xscale: { description: 'Scale applied to the x coordinate.' },
      yscale: { description: 'Scale applied to the y coordinate.' },
    },
  },
  symNetG4Var: {
    summary:
      'A post symmetry variation that randomly applies one of four reflection and translation transforms with both separation and step offsets, replicating the point into a symmetry network.',
    params: {
      sepx: { description: 'Horizontal separation offset between copies.' },
      sepy: { description: 'Vertical separation offset between copies.' },
      stepx: { description: 'Additional horizontal step offset per copy.' },
      stepy: { description: 'Additional vertical step offset per copy.' },
    },
  },
  symBandG4Var: {
    summary:
      'A post symmetry variation that randomly chooses between a shifted copy and a horizontally flipped, shifted copy, replicating the point into a frieze band.',
    params: {
      stepx: { description: 'Horizontal step between band copies.' },
      stepy: { description: 'Vertical step between band copies.' },
    },
  },
  symBandG6Var: {
    summary:
      'A post symmetry variation that randomly applies one of four transforms combining horizontal and vertical reflections with step offsets, replicating the point into a frieze band with both mirror axes.',
    params: {
      stepx: { description: 'Horizontal step between band copies.' },
      stepy: { description: 'Vertical step between band copies.' },
    },
  },
  symNetG2Var: {
    summary:
      'Post symmetry-net transform that randomly picks one of two branches per point: a half-step shift, or a half-step shift combined with a vertical flip. Tiles the plane into a mirror-symmetric network.',
    params: {
      stepx: {
        description:
          'Horizontal tiling step; half of it is added or subtracted depending on the branch.',
      },
      stepy: {
        description:
          'Vertical tiling step; half of it is added or subtracted depending on the branch.',
      },
    },
  },
  postAxisSymmetryWfVar: {
    summary:
      'Post transform that mirrors points across a chosen axis through a centre, randomly keeping or reflecting each point and offsetting by half the weight, with an optional rotation about the centre.',
    params: {
      axis: {
        description:
          'Selects the symmetry axis: values below the midpoint use the X axis, otherwise the Y axis.',
      },
      centre_x: {
        description: 'Horizontal coordinate of the symmetry centre.',
      },
      centre_y: { description: 'Vertical coordinate of the symmetry centre.' },
      rotation: {
        description:
          'Rotation in degrees applied about the centre; half of it is used as the rotation angle, and zero disables the rotation step.',
      },
    },
  },
  postCurlVar: {
    summary:
      'Post curl transform that maps the point through a complex-valued rational function, producing a twisting, swirling distortion. The strength scales with the variation weight.',
    tex: 'V=\\left(\\frac{x\\,\\mathrm{re}+y\\,\\mathrm{im}}{\\mathrm{re}^2+\\mathrm{im}^2},\\ \\frac{y\\,\\mathrm{re}-x\\,\\mathrm{im}}{\\mathrm{re}^2+\\mathrm{im}^2}\\right)',
    params: {
      c1: {
        description:
          'Linear curl coefficient, scaled by weight; controls the first-order twist.',
      },
      c2: {
        description:
          'Quadratic curl coefficient, scaled by weight; controls the second-order twist.',
      },
    },
  },
  postPointSymmetryWfVar: {
    summary:
      'Post transform that creates rotational point symmetry of a given order: each point is rotated about a centre by a random multiple of the base angle. The offset from the centre is scaled by the weight.',
    params: {
      centre_x: {
        description: 'Horizontal coordinate of the rotation centre.',
      },
      centre_y: { description: 'Vertical coordinate of the rotation centre.' },
      order: {
        description:
          'Number of rotational copies; the rotation angle is a random integer multiple of a full turn divided by this order.',
      },
    },
  },
  symNetG3Var: {
    summary:
      'Post symmetry-net transform that randomly chooses between a translation and a point reflection (negating both coordinates), each offset by separation and half-step amounts. Tiles the plane into a symmetric network.',
    params: {
      sepx: {
        description: 'Horizontal separation offset added to the tiling shift.',
      },
      sepy: {
        description: 'Vertical separation offset added to the tiling shift.',
      },
      step: { description: 'Tiling step; half of it is added to both axes.' },
    },
  },
  postBWraps2Var: {
    summary:
      'Post Bubble-Wrap transform that tiles the plane into square cells and, for points inside a cell radius, wraps them into a bubble with a twist that blends from inner to outer angle. Points outside the radius are left unchanged.',
    params: {
      cellsize: {
        description:
          'Edge length of the square cells the plane is divided into.',
      },
      space: {
        description:
          'Spacing factor between bubbles; larger values shrink the effective bubble radius.',
      },
      gain: {
        description:
          'Bubble magnification factor controlling how strongly points are pulled into the bubble shape.',
      },
      inner_twist: {
        description: 'Rotation angle applied at the bubble centre.',
      },
      outer_twist: {
        description:
          'Rotation angle applied at the bubble edge; the actual twist interpolates between inner and outer by radius.',
      },
    },
  },
  symNetG1Var: {
    summary:
      'Post symmetry-net transform that randomly shifts each point by either minus or plus half a step on both axes, producing a simple translational tiling.',
    params: {
      stepx: {
        description:
          'Horizontal tiling step; half of it is added or subtracted.',
      },
      stepy: {
        description: 'Vertical tiling step; half of it is added or subtracted.',
      },
    },
  },
  symNetG11Var: {
    summary:
      'Post symmetry-net transform that randomly selects one of eight wallpaper-group operations (translations, reflections, and 90 degree rotations) with spacing and half-step offsets, building a square-symmetry tiling.',
    params: {
      space: { description: 'General spacing parameter for the tiling.' },
      spacex: {
        description:
          'Horizontal spacing offset applied within each symmetry operation.',
      },
      spacey: {
        description:
          'Vertical spacing offset applied within each symmetry operation.',
      },
      stepx: {
        description: 'Horizontal tiling step; half of it offsets each branch.',
      },
      stepy: {
        description: 'Vertical tiling step; half of it offsets each branch.',
      },
    },
  },
  symNetG7Var: {
    summary:
      'Post symmetry-net transform that randomly picks between a translation and a horizontal-mirror branch (flipping y), each offset by half the separation. Tiles the plane with a glide-like symmetry.',
    params: {
      sepx: {
        description:
          'Horizontal separation; half of it is added or subtracted.',
      },
      sepy: {
        description:
          'Vertical separation; half of it offsets the y coordinate in each branch.',
      },
    },
  },
  symNetG5Var: {
    summary:
      'Post symmetry-net transform that randomly picks one of four branches combining translations and reflections with separation and half-step offsets, producing a banded symmetric tiling.',
    params: {
      sepx: {
        description: 'Horizontal separation offset used in all branches.',
      },
      sepy: { description: 'Vertical separation offset used in all branches.' },
      stepx: {
        description: 'Horizontal tiling step; half of it offsets the branches.',
      },
    },
  },
  postCropVar: {
    summary:
      'Post crop transform that keeps points inside a rectangular region unchanged; points outside are either zeroed or scattered back toward the nearest edge by a random amount, depending on the zero flag.',
    params: {
      left: {
        description:
          'One horizontal edge of the crop rectangle; min and max are derived from left and right.',
      },
      right: {
        description: 'The other horizontal edge of the crop rectangle.',
      },
      top: {
        description:
          'One vertical edge of the crop rectangle; min and max are derived from top and bottom.',
      },
      bottom: { description: 'The other vertical edge of the crop rectangle.' },
      scatter_area: {
        description:
          'Fraction of the rectangle half-size over which out-of-bounds points are randomly scattered back inside.',
      },
      zero: {
        description:
          'When set, out-of-bounds points are mapped to the origin instead of being scattered back to the edges.',
      },
    },
  },
  symNetG12Var: {
    summary:
      'Post symmetry-net transform that pre-offsets the point by a uniform space, then randomly applies one of eight square-symmetry operations (translations, reflections, and rotations) with extra spacing offsets.',
    params: {
      space: {
        description:
          'Uniform offset added to both coordinates before applying the symmetry operation.',
      },
      spacex: {
        description:
          'Horizontal spacing offset applied within each symmetry operation.',
      },
      spacey: {
        description:
          'Vertical spacing offset applied within each symmetry operation.',
      },
    },
  },
  symBandG1Var: {
    summary:
      'Post symmetry-band transform that randomly chooses between two translations: one shifted left by a unit plus half a step, the other shifted by plus half a step. Produces a one-dimensional banded repetition.',
    params: {
      stepx: {
        description: 'Horizontal band step; half of it offsets each branch.',
      },
      stepy: {
        description: 'Vertical band step; half of it offsets each branch.',
      },
    },
  },
  postHeatVar: {
    summary:
      'Post heat-shimmer transform that perturbs each point by a random displacement whose magnitude is modulated by a product of sines of the scaled coordinates, giving a rippling heat-haze effect.',
    tex: 'n=\\sin(x\\,\\text{scale})\\,\\sin(y\\,\\text{scale})\\,\\text{amount}',
    params: {
      amount: { description: 'Overall strength of the random displacement.' },
      scale: {
        description:
          'Spatial frequency of the sine modulation that varies the displacement across the plane.',
      },
    },
  },
  symNetG14Var: {
    summary:
      'Post symmetry-net transform implementing sixfold (hexagonal) symmetry: after a radius-based offset it randomly applies one of six 60 degree rotation/reflection operations, doubled by a random sign for twelve branches, with half-step shifts.',
    params: {
      radius: {
        description:
          'Radial offset applied to both coordinates before the symmetry operation, derived from the square root of half the radius squared.',
      },
      stepx: {
        description:
          'Horizontal tiling step; half of it, signed at random, offsets each branch.',
      },
      stepy: {
        description:
          'Vertical tiling step; half of it, signed at random, offsets each branch.',
      },
    },
  },
  symNetG15Var: {
    summary:
      'Post symmetry-net transform with sixfold symmetry using a different set of rotation and reflection operations than its sibling: after a radius offset it randomly applies one of six hexagonal operations, sign-doubled to twelve branches, with half-step shifts.',
    params: {
      radius: {
        description:
          'Radial offset applied to both coordinates before the symmetry operation, derived from the square root of half the radius squared.',
      },
      stepx: {
        description:
          'Horizontal tiling step; half of it, signed at random, offsets each branch.',
      },
      stepy: {
        description:
          'Vertical tiling step; half of it, signed at random, offsets each branch.',
      },
    },
  },
  symNetG8Var: {
    summary:
      'Post symmetry-net transform that randomly applies one of eight reflection and translation operations, offset by half separations and half skews, producing a skewed symmetric tiling.',
    params: {
      skewx: {
        description: 'Horizontal skew; half of it offsets the branches.',
      },
      skewy: { description: 'Vertical skew; half of it offsets the branches.' },
      sepx: {
        description: 'Horizontal separation; half of it offsets the branches.',
      },
      sepy: {
        description: 'Vertical separation; half of it offsets the branches.',
      },
    },
  },
  symNetG17Var: {
    summary:
      'Post symmetry-net transform with twelvefold symmetry: after a radius offset it randomly applies one of twelve rotation and reflection operations, sign-doubled to twenty-four branches, with half-step shifts.',
    params: {
      radius: {
        description:
          'Radial offset applied to both coordinates before the symmetry operation, derived from the square root of half the radius squared.',
      },
      stepx: {
        description:
          'Horizontal tiling step; half of it, signed at random, offsets each branch.',
      },
      stepy: {
        description:
          'Vertical tiling step; half of it, signed at random, offsets each branch.',
      },
    },
  },
  symNetG6Var: {
    summary:
      'Post symmetry-net transform that randomly chooses one of four translation branches, all shifted by half steps with the vertical offset further nudged by plus or minus half the y separation.',
    params: {
      sepy: {
        description:
          'Vertical separation; half of it nudges the y coordinate up or down per branch.',
      },
      stepx: {
        description:
          'Horizontal tiling step; half of it shifts the x coordinate.',
      },
      stepy: {
        description:
          'Vertical tiling step; half of it shifts the y coordinate.',
      },
    },
  },
  symBandG5Var: {
    summary:
      'Post symmetry-band transform that randomly chooses between a plain translation and a horizontal-mirror branch (flipping y), each with unit and half-step offsets. Produces a banded glide-mirror repetition.',
    params: {
      stepx: {
        description: 'Horizontal band step; half of it offsets each branch.',
      },
      stepy: {
        description: 'Vertical band step; half of it offsets each branch.',
      },
    },
  },
  symNetG13Var: {
    summary:
      'Post symmetry-net transform with threefold (120 degree) symmetry: after a radius offset it randomly applies one of three rotation operations, split into two groups offset by minus or plus half steps, for six branches total.',
    params: {
      radius: {
        description:
          'Radial offset applied to both coordinates before the symmetry operation, derived from the square root of half the radius squared.',
      },
      stepx: {
        description:
          'Horizontal tiling step; half of it offsets the two branch groups.',
      },
      stepy: {
        description:
          'Vertical tiling step; half of it offsets the two branch groups.',
      },
    },
  },
  symBandG7Var: {
    summary:
      'Post symmetry-band transform that randomly picks one of four branches combining translations and reflections with unit and half-step offsets, producing a banded symmetric repetition.',
    params: {
      stepx: {
        description: 'Horizontal band step; half of it offsets each branch.',
      },
      stepy: {
        description: 'Vertical band step; half of it offsets each branch.',
      },
    },
  },
  symBandG3Var: {
    summary:
      'Post symmetry-band transform that randomly chooses between a translation and a point reflection (negating both coordinates), each with unit and half-step offsets. Produces a banded centrosymmetric repetition.',
    params: {
      stepx: {
        description: 'Horizontal band step; half of it offsets each branch.',
      },
      stepy: {
        description: 'Vertical band step; half of it offsets each branch.',
      },
    },
  },
  preGaussianVar: {
    summary:
      'Pre transform applied before the affine that attenuates each point by a Gaussian falloff of its radius, pulling distant points toward the origin. Acts as a soft radial mask.',
    tex: 'V=(x,y)\\,e^{-r^2/(2\\sigma^2)}',
    params: {
      sigma: {
        description:
          'Width of the Gaussian falloff; larger values keep more of the outer points.',
      },
    },
  },
  preCurlVar: {
    summary:
      'Pre curl transform applied before the affine that maps the point through a complex-valued rational function, producing a twisting distortion. Scaled by the variation weight.',
    tex: 'V=\\left(\\frac{x\\,\\mathrm{re}+y\\,\\mathrm{im}}{\\mathrm{re}^2+\\mathrm{im}^2},\\ \\frac{y\\,\\mathrm{re}-x\\,\\mathrm{im}}{\\mathrm{re}^2+\\mathrm{im}^2}\\right)',
    params: {
      c1: {
        description:
          'Linear curl coefficient controlling the first-order twist.',
      },
      c2: {
        description:
          'Quadratic curl coefficient controlling the second-order twist.',
      },
    },
  },
}
