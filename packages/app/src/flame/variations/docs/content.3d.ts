import type { VariationDocMap } from './types'

/**
 * Documentation for the 3D variations (defined inline in variations3D). These
 * map a vec3f and are projected to the canvas; summaries note the 3D nature.
 * Drafted from the implementations; complex/random maps omit a `tex`.
 */
export const variationDocs3D: VariationDocMap = {
  waves3D: {
    summary:
      'A 3D map that shears each coordinate by a sine wave driven by the next axis, with per-axis amplitude and frequency. Produces rippling, woven sheets in space.',
    tex: 'V=(x+a_x\\\\sin(f_x y),\\\\; y+a_y\\\\sin(f_y z),\\\\; z+a_z\\\\sin(f_z x))',
    params: {
      scaleX: {
        description:
          'Amplitude of the sine displacement applied to the x coordinate.',
      },
      scaleY: {
        description:
          'Amplitude of the sine displacement applied to the y coordinate.',
      },
      scaleZ: {
        description:
          'Amplitude of the sine displacement applied to the z coordinate.',
      },
      freqX: {
        description:
          'Frequency of the wave driving the x displacement (sampled from y).',
      },
      freqY: {
        description:
          'Frequency of the wave driving the y displacement (sampled from z).',
      },
      freqZ: {
        description:
          'Frequency of the wave driving the z displacement (sampled from x).',
      },
    },
  },
  rings3D: {
    summary:
      'A 3D map that quantizes points into concentric spherical shells by folding the radius modulo a scaled period, then rescaling along the original direction. Creates nested rings around the origin.',
    tex: 'V = \\frac{t}{r}\\,(x,\\ y,\\ z),\\ t = (r \\bmod 2\\,radiusScale) - radiusScale + r\\,(1-radiusScale),\\ r = |\\mathbf{p}|',
    params: {
      radiusScale: {
        description:
          'Sets the spacing of the concentric shells and how strongly the radius is remapped.',
      },
    },
  },
  pdj3D: {
    summary:
      'A 3D map where each output axis is a difference of a sine and a cosine of a scaled neighboring coordinate. Generates intricate looping, web-like attractors.',
    tex: 'V=(\\\\sin(a y)-\\\\cos(b x),\\\\; \\\\sin(c z)-\\\\cos(d y),\\\\; \\\\sin(e x)-\\\\cos(f z))',
    params: {
      a: {
        description:
          'Frequency of the sine term in the x output (applied to y).',
      },
      b: {
        description:
          'Frequency of the cosine term in the x output (applied to x).',
      },
      c: {
        description:
          'Frequency of the sine term in the y output (applied to z).',
      },
      d: {
        description:
          'Frequency of the cosine term in the y output (applied to y).',
      },
      e: {
        description:
          'Frequency of the sine term in the z output (applied to x).',
      },
      f: {
        description:
          'Frequency of the cosine term in the z output (applied to z).',
      },
    },
  },
  fan3D: {
    summary:
      'A 3D map that converts a point to spherical angles, wraps the azimuth and polar angles into wedges of a chosen width, and recenters them before converting back to Cartesian at the original radius. Folds space into angular fan segments.',
    params: {
      spreadTheta: {
        description:
          'Angular width of the azimuthal (longitude) wedge into which points are folded.',
      },
      spreadPhi: {
        description:
          'Angular width of the polar (latitude) wedge into which points are folded.',
      },
    },
  },
  popcorn3D: {
    summary:
      'A 3D map that adds to each coordinate a sine of the tangent of a frequency-scaled neighboring axis. The nested sin-of-tan produces sharp, scattered popcorn-like bursts.',
    tex: 'V=(x+c\\\\sin(\\\\tan(f y)),\\\\; y+c\\\\sin(\\\\tan(f z)),\\\\; z+c\\\\sin(\\\\tan(f x)))',
    params: {
      c: {
        description:
          'Overall amplitude of the displacement added to each coordinate.',
      },
      f: {
        description:
          'Frequency feeding the tangent inside the displacement, controlling burst density.',
      },
    },
  },
  blurLinear3D: {
    summary:
      'A 3D blur map that nudges each point a random distance along a fixed direction set by spherical angles. Smears points into a soft line segment in space.',
    params: {
      radius: {
        description:
          'Maximum distance points are displaced along the blur direction.',
      },
      theta: { description: 'Azimuthal angle defining the blur direction.' },
      phi: { description: 'Polar angle defining the blur direction.' },
    },
  },
  rectangles3D: {
    summary:
      'A 3D map that reflects each coordinate within a grid of cells of a chosen size, tiling space into mirrored rectangular boxes.',
    tex: 'V=((2\\\\lfloor x/p_x\\\\rfloor+1)p_x-x,\\\\; (2\\\\lfloor y/p_y\\\\rfloor+1)p_y-y,\\\\; (2\\\\lfloor z/p_z\\\\rfloor+1)p_z-z)',
    params: {
      x: { description: 'Cell size along the x axis.' },
      y: { description: 'Cell size along the y axis.' },
      z: { description: 'Cell size along the z axis.' },
    },
  },
  splits3D: {
    summary:
      'A 3D map that pushes each coordinate outward by a fixed offset whose sign follows the sign of that coordinate. Splits space into separated octant-like slabs around the origin.',
    tex: 'V=(x+\\\\text{sgn}(x)p_x,\\\\; y+\\\\text{sgn}(y)p_y,\\\\; z+\\\\text{sgn}(z)p_z)',
    params: {
      x: {
        description:
          'Offset added along the x axis, pushing points away from the x=0 plane.',
      },
      y: {
        description:
          'Offset added along the y axis, pushing points away from the y=0 plane.',
      },
      z: {
        description:
          'Offset added along the z axis, pushing points away from the z=0 plane.',
      },
    },
  },
  modulus3D: {
    summary:
      'A 3D map that wraps each coordinate back into a bounded range whenever it strays beyond a per-axis limit, tiling far-flung points into a central box. Coordinates within the range pass through unchanged.',
    params: {
      x: { description: 'Half-width of the wrap range along the x axis.' },
      y: { description: 'Half-width of the wrap range along the y axis.' },
      z: { description: 'Half-width of the wrap range along the z axis.' },
    },
  },
  separation3D: {
    summary:
      'A 3D map that, per axis, reflects the point to the opposite side of the origin using a hyperbolic-like offset and an inside-pull term. Cleaves space into two separated lobes along each axis.',
    tex: 'V_i = \\operatorname{sgn}(p_i)\\sqrt{p_i^2 + s_i^2} - p_i\\,inside_i',
    params: {
      x: {
        description:
          'Separation amount along the x axis controlling the gap width.',
      },
      xInside: {
        description:
          'Inward pull applied to the x output, drawing points back toward the center.',
      },
      y: {
        description:
          'Separation amount along the y axis controlling the gap width.',
      },
      yInside: {
        description:
          'Inward pull applied to the y output, drawing points back toward the center.',
      },
      z: {
        description:
          'Separation amount along the z axis controlling the gap width.',
      },
      zInside: {
        description:
          'Inward pull applied to the z output, drawing points back toward the center.',
      },
    },
  },
  blob3D: {
    summary:
      'A 3D map that scales each point by a radial factor oscillating with the azimuthal angle between a low and high bound. Produces lobed, flower-like blobs in space.',
    tex: 'V = \\left(low + \\tfrac{high-low}{2}(\\sin(waves\\,\\theta)+1)\\right)(x,\\ y,\\ z),\\ \\theta = \\arctan(y/x)',
    params: {
      high: {
        description: 'Upper bound of the radial scaling factor at wave peaks.',
      },
      low: {
        description:
          'Lower bound of the radial scaling factor at wave troughs.',
      },
      waves: {
        description:
          'Number of lobes around the azimuth (frequency of the angular oscillation).',
      },
    },
  },
  bent2_3D: {
    summary:
      'A 3D map that scales each coordinate by a per-axis factor only when that coordinate is negative, leaving positive coordinates unchanged. Bends or stretches one side of space per axis.',
    params: {
      x: { description: 'Scale applied to negative x values.' },
      y: { description: 'Scale applied to negative y values.' },
      z: { description: 'Scale applied to negative z values.' },
    },
  },
  zScale3D: {
    summary:
      'A 3D map that multiplies only the z coordinate by a factor, leaving x and y untouched. Stretches, squashes, or flips the depth axis.',
    tex: 'V=(x,\\\\; y,\\\\; s\\\\,z)',
    params: {
      scale: { description: 'Multiplier applied to the z coordinate.' },
    },
  },
  linear3D: {
    summary:
      'A 3D identity map that returns the point unchanged, the simplest building block for 3D flames.',
    tex: 'V=(x,\\\\; y,\\\\; z)',
  },
  spherical3D: {
    summary:
      'A 3D map that inverts each point through the unit sphere by dividing by its squared radius. Pulls distant points inward and pushes near points outward.',
    tex: 'V=\\\\frac{(x,y,z)}{x^2+y^2+z^2}',
  },
  sinusoidal3D: {
    summary:
      'A 3D map that applies the sine function independently to each coordinate, folding space into a bounded oscillating lattice.',
    tex: 'V=(\\\\sin x,\\\\; \\\\sin y,\\\\; \\\\sin z)',
  },
  swirl3D: {
    summary:
      'A 3D map that rotates the x and y plane by an angle equal to the squared radius while leaving z unchanged. Creates a spiral swirl that twists tighter with distance.',
    tex: 'V=(x\\\\cos r^2-y\\\\sin r^2,\\\\; x\\\\sin r^2+y\\\\cos r^2,\\\\; z),\\\\; r^2=x^2+y^2+z^2',
  },
  julia3D: {
    summary:
      'A 3D map that takes the square root of the radius and halves the spherical angles, then randomly flips the result through the origin. Builds branching, self-similar 3D Julia structures.',
  },
  horseshoe3D: {
    summary:
      'A 3D map that applies a quadratic cross-coordinate transform divided by the radius, bending space into a horseshoe-like fold extended into the depth axis.',
    tex: 'V = \\tfrac{1}{r}\\big((x-y)(x+y+z),\\ 2x(y+z),\\ (y-z)(y+z)\\big),\\ r=\\sqrt{x^2+y^2+z^2}',
  },
  polar3D: {
    summary:
      'A 3D map that replaces a point with its spherical coordinates, mapping azimuth, polar angle, and radius onto the three output axes. Unwraps space into an angular slab.',
    tex: 'V = \\big(\\tfrac{\\theta}{\\pi},\\ \\tfrac{2\\phi}{\\pi}-1,\\ r-1\\big),\\ \\theta=\\arctan(y/x),\\ \\phi=\\arccos(z/r)',
  },
  bubble3D: {
    summary:
      'A 3D map that scales each point by a factor based on its squared radius, wrapping space onto a rounded bubble surface. Distant points compress toward a sphere.',
    tex: 'V=\\\\frac{4}{x^2+y^2+z^2+4}(x,y,z)',
  },
  cylinder3D: {
    summary:
      'A 3D map that replaces the x coordinate with its sine while leaving y and z unchanged, wrapping space around a cylinder aligned with the depth axis.',
    tex: 'V=(\\\\sin x,\\\\; y,\\\\; z)',
  },
  gaussian3D: {
    summary:
      'A 3D blur map that ignores the input point and scatters output across a Gaussian-like cloud. It picks a random direction on the unit sphere and scales it by a sum of four random samples minus two, approximating a normal distribution.',
  },
  sphere3D: {
    summary:
      'A 3D map that projects every input point onto the surface of the unit sphere, producing a clean spherical shell like a globe. It normalizes the position by its length.',
    tex: 'V=\\frac{(x,y,z)}{\\sqrt{x^2+y^2+z^2}}',
  },
  starfield3D: {
    summary:
      'A 3D blur map that ignores the input and snaps each hit to one of about 240 fixed star positions on a far spherical shell. Each star index is hashed into stable spherical angles and a radius, concentrating plots into crisp discrete points.',
  },
  spiral3D: {
    summary:
      'A 3D map that applies a radius-dependent rotation in the xy-plane while passing z through, then divides by the radius. The rotation angle is the azimuth plus the radius, giving a spiral twist.',
    tex: 'V = \\tfrac{1}{r}\\big(x\\cos(\\theta+r)-y\\sin(\\theta+r),\\ x\\sin(\\theta+r)+y\\cos(\\theta+r),\\ z\\big)',
  },
  cross3D: {
    summary:
      'A 3D map that scales the input point by an inverse function of its squared radius, pulling points into a cross-shaped pattern. The scale factor is the square root of one over the squared radius squared.',
    tex: 'V=(x,y,z)\\sqrt{\\frac{1}{(x^2+y^2+z^2)^2}}',
  },
  curl3D: {
    summary:
      'A 3D map that applies a complex-style curl transform extended to three dimensions, warping the point using terms built from one plus x and the squared y and z. The result is divided by a denominator combining those terms.',
    tex: 'V = \\tfrac{1}{d}\\big(t^2-(y^2+z^2),\\ 2y\\,t,\\ 2z\\,t\\big),\\ t=1+x,\\ d=t^2+y^2+z^2',
  },
  heart3D: {
    summary:
      'A 3D map that converts the point to spherical coordinates and modulates the azimuth and polar angles by the radius, producing a heart-like folded surface. The output is scaled back up by the radius.',
    tex: 'V = r\\big(\\sin(r\\theta)\\sin(r\\phi),\\ \\cos(r\\theta)\\sin(r\\phi),\\ \\cos(r\\phi)\\big)',
  },
  fisheye3D: {
    summary:
      'A 3D map that scales the input point by two divided by the radius plus one, producing a fisheye bulge that emphasizes points near the origin. Distant points are compressed inward.',
    tex: 'V=(x,y,z)\\cdot\\frac{2}{r+1},\\quad r=\\sqrt{x^2+y^2+z^2}',
  },
  eyefish3D: {
    summary:
      'A 3D map that scales the input point by twice the radius divided by the radius plus one, an inverse fisheye that expands outer points. It is the eyefish counterpart of the fisheye bulge.',
    tex: 'V=(x,y,z)\\cdot\\frac{2r}{r+1},\\quad r=\\sqrt{x^2+y^2+z^2}',
  },
  ex3D: {
    summary:
      'A 3D map that converts the point to spherical coordinates and builds each output component from cubes of sines and cosines of the angles offset by the radius. This produces the characteristic ex petal-and-fold pattern in three dimensions.',
    tex: 'V = r\\big(p_0^3+p_1^3,\\ p_1^3+p_2^3,\\ p_2^3+p_3^3\\big),\\ p_0=\\sin(\\theta+r),\\ p_1=\\cos(\\theta-r),\\ p_2=\\sin(\\phi+r),\\ p_3=\\cos(\\phi-r)',
  },
  disc3D: {
    summary:
      'A 3D map that converts the point to spherical coordinates, scales the azimuth by one over pi, and modulates the result with sines and cosines of pi times the radius. This wraps the point into concentric disc rings spread over the polar angle.',
    tex: 'V = \\tfrac{\\theta}{\\pi}\\big(\\sin(\\pi r)\\sin\\phi,\\ \\cos(\\pi r)\\sin\\phi,\\ \\cos\\phi\\big),\\ \\theta=\\arctan(y/x),\\ \\phi=\\arccos(z/r)',
  },
  diamond3D: {
    summary:
      'A 3D map that normalizes the point onto the unit sphere then modulates each axis by a cosine or sine of the radius. The x and z use cosine while y uses sine, producing a faceted diamond pattern.',
    tex: 'V = \\tfrac{1}{r}\\big(x\\cos r,\\ y\\sin r,\\ z\\cos r\\big)',
  },
  bent3D: {
    summary:
      'A 3D map that bends space by rescaling negative coordinates per axis. Negative x is doubled while negative y and z are halved, and non-negative values pass through unchanged.',
    tex: "V = (x',\\ y',\\ z'),\\ x'=\\begin{cases}2x & x<0\\\\ x & x\\ge0\\end{cases},\\ y'=\\begin{cases}\\tfrac{y}{2} & y<0\\\\ y & y\\ge0\\end{cases},\\ z'=\\begin{cases}\\tfrac{z}{2} & z<0\\\\ z & z\\ge0\\end{cases}",
  },
  exponential3D: {
    summary:
      'A 3D map that takes an exponential of x minus one as a radial scale, then spreads the point in spherical directions using pi times y as one angle and pi times z as another. This yields an exponential bloom in 3D.',
    tex: 'V=e^{x-1}(\\cos(\\pi y)\\cos(\\pi z),\\sin(\\pi y)\\cos(\\pi z),\\sin(\\pi z))',
  },
  power3D: {
    summary:
      'A 3D map that converts the point to spherical coordinates and raises the radius to the power of the sine of the azimuth. The scaled radius is then redistributed across the spherical direction vector.',
    tex: 'V = r^{\\sin\\theta}\\big(\\cos\\theta\\sin\\phi,\\ \\sin\\theta\\sin\\phi,\\ \\cos\\phi\\big)',
  },
  handkerchief3D: {
    summary:
      'A 3D map that converts the point to spherical coordinates and folds it using sines and cosines of the angles offset by the radius. This produces the rippled handkerchief surface extended into three dimensions.',
    tex: 'V = r\\big(\\sin(\\theta+r)\\sin\\phi,\\ \\cos(\\theta-r)\\sin\\phi,\\ \\cos(\\phi+r)\\big)',
  },
  cylindrical3D: {
    summary:
      'A 3D map that wraps the point around a cylinder using the planar radius of x and y, with z passed through. The x and y outputs are the sine and cosine of x scaled by that radius.',
    tex: 'V = \\big(\\rho\\sin x,\\ \\rho\\cos x,\\ z\\big),\\ \\rho=\\sqrt{x^2+y^2}',
  },
  hemisphere3D: {
    summary:
      'A 3D map that scales the input point by one over the square root of its squared length plus one, projecting it onto a hemisphere-like surface. Points are pulled toward a unit dome.',
    tex: 'V=\\frac{(x,y,z)}{\\sqrt{x^2+y^2+z^2+1}}',
  },
  scry3D: {
    summary:
      'A 3D map that scales the point by an inverse function of the radius, drawing points toward the origin in a scrying-glass effect. The scale combines the radius, its square, and a reciprocal term.',
    tex: 'V = \\frac{(x,y,z)}{r^3+1},\\ r=\\sqrt{x^2+y^2+z^2}',
  },
  square3D: {
    summary:
      'A 3D blur map that ignores the input and returns a uniformly random point inside a unit cube centered on the origin. Each coordinate is a random value between minus one half and one half.',
  },
  blur3D: {
    summary:
      'A 3D blur map that ignores the input and fills a solid unit ball with uniform density. It picks a random direction on the unit sphere and scales it by the cube root of a random value.',
  },
}
