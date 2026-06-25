import type { VariationDocMap } from './types'

/**
 * Documentation for the non-parametric ("simple") variations. Summaries and
 * formulas were drafted from each variation's own implementation (the math the
 * GPU runs). Random / piecewise / quaternion-style maps that do not reduce to a
 * short closed form are described qualitatively without a `tex` formula. Refine
 * as needed — keys are the registry type-literals, checked by docs.coverage.test.
 */
export const variationDocsSimple: VariationDocMap = {
  circleBlurVar: {
    summary:
      'Blur variation that ignores the input and scatters points uniformly inside a unit disk by picking a random angle and a square-root distributed radius. Produces a soft filled circle of noise.',
    tex: 'V = w \\cdot (\\cos a \\sqrt{u},\\ \\sin a \\sqrt{u})',
  },
  acosechVar: {
    summary:
      'Complex inverse hyperbolic cosecant (arccsch) of the input treated as a complex number, with the real and imaginary parts swapped, scaled by 2 pi times the weight and randomly negated.',
  },
  acoshVar: {
    summary:
      'Complex inverse hyperbolic cosine (arccosh) of the input treated as a complex number, computed via a complex square root and log, scaled by 2 pi times the weight and randomly negated.',
  },
  acothVar: {
    summary:
      'Complex inverse hyperbolic cotangent (arccoth) of the input as a complex number, formed from half the log of (z+1)/(z-1) with real and imaginary parts swapped and scaled by 2 pi times the weight.',
  },
  apocarpetVar: {
    summary:
      'Randomly applies one of six contractive transforms, producing an Apollonian / Sierpinski-carpet-like iterated function system. One branch squares and inverts the point while the others scale and offset it by the silver-ratio factor 1/(1+sqrt 2).',
  },
  archVar: {
    summary:
      'Picks a random angle proportional to the weight and returns the sine of that angle paired with sine squared over cosine, tracing an arch-shaped curve independent of the input position.',
    tex: 'a = u\\,w\\,\\pi;\\quad V = (\\sin a,\\ \\tfrac{\\sin^2 a}{\\cos a})',
  },
  arcsech2Var: {
    summary:
      'A complex inverse hyperbolic secant style mapping that inverts the point, takes complex square roots about plus and minus one, sums them, and returns the complex log with a sign-dependent offset on the imaginary part.',
  },
  arcsinhVar: {
    summary:
      'Complex inverse hyperbolic sine (arcsinh) of the input treated as a complex number, computed via a complex square root of z squared plus one and a log, scaled by 2 pi times the weight.',
    tex: 'V = 2\\pi w \\cdot (\\Re,\\Im)\\,\\ln(z + \\sqrt{z^2+1}),\\ z = x + iy',
  },
  arctanhVar: {
    summary:
      'Complex inverse hyperbolic tangent (arctanh) of the input as a complex number, formed from the log of (1+z)/(1-z) and scaled by 2 pi times the weight.',
    tex: 'V = 2\\pi w \\cdot (\\Re,\\Im)\\,\\ln\\tfrac{1+z}{1-z},\\ z = x + iy',
  },
  bilinearVar: {
    summary:
      'Swaps the x and y coordinates and scales by the weight, reflecting the point across the diagonal line y equals x.',
    tex: 'V = w \\cdot (y,\\ x)',
  },
  boardersVar: {
    summary:
      'Splits the plane into unit cells and pulls points toward cell centers; with low probability it just halves the offset, otherwise it snaps the point to the dominant-axis border of its cell, creating a tiled bordered pattern.',
  },
  chrysanthemumVar: {
    summary:
      'Ignores the input and plots a parametric chrysanthemum flower curve over a random parameter, where a radial function of nested sines and cosines is converted to Cartesian coordinates and scaled by the weight.',
  },
  collatzVar: {
    summary:
      'Maps the point magnitude to an integer, runs 64 Collatz iterations counting the steps taken, then offsets the original point by a radius and angle derived from that step count normalized to a fraction.',
  },
  cosVar: {
    summary:
      'Complex cosine of the input treated as a complex number, scaled by the weight.',
    tex: 'V = w \\cdot (\\cos x \\cosh y,\\ -\\sin x \\sinh y)',
  },
  coshVar: {
    summary:
      'Complex hyperbolic cosine of the input treated as a complex number, scaled by the weight.',
    tex: 'V = w \\cdot (\\cosh x \\cos y,\\ \\sinh x \\sin y)',
  },
  coshqVar: {
    summary:
      'A quaternion-flavored hyperbolic cosine using only the y component as the imaginary magnitude, returning cosh x times cosine of the magnitude for x and a sinc-weighted sinh term for y, scaled by the weight.',
    tex: 'V = w \\cdot (\\cosh x \\cos y,\\ \\sinh x \\sin y)',
  },
  cosqVar: {
    summary:
      'A quaternion-flavored cosine using the y component as the imaginary magnitude, returning cos x times cosh of the magnitude for x and a sinc-weighted negative sine term for y, scaled by the weight.',
    tex: 'V = w \\cdot (\\cos x \\cosh y,\\ -\\sin x \\sinh y)',
  },
  cotVar: {
    summary:
      'Complex cotangent of the input treated as a complex number, with a guarded denominator, scaled by the weight.',
    tex: 'V = \\tfrac{w}{\\cosh 2y - \\cos 2x} \\cdot (\\sin 2x,\\ -\\sinh 2y)',
  },
  cothVar: {
    summary:
      'Complex hyperbolic cotangent of the input treated as a complex number, scaled by the weight, returning zero when the denominator vanishes.',
    tex: 'V = \\tfrac{w}{\\cosh 2x - \\cos 2y} \\cdot (\\sinh 2x,\\ \\sin 2y)',
  },
  cothqVar: {
    summary:
      'A quaternion-flavored hyperbolic cotangent using the y component as imaginary magnitude, combining sinh and cosh of x with sine and cosine of that magnitude through a reciprocal-norm factor, scaled by the weight.',
    tex: 'V = \\tfrac{w}{x^2+y^2} \\cdot (\\sinh x \\cosh x,\\ \\sin y \\cos y)',
  },
  cotqVar: {
    summary:
      'A quaternion-flavored cotangent using the y component as imaginary magnitude, combining sine and cosine of x with sinh and cosh of that magnitude through a reciprocal-norm factor, scaled by the weight.',
    tex: 'V = \\tfrac{w}{x^2+y^2} \\cdot (\\sin x \\cos x,\\ -\\sinh y \\cosh y)',
  },
  cscVar: {
    summary:
      'Complex cosecant of the input treated as a complex number, with a guarded denominator, scaled by the weight.',
    tex: 'V = \\tfrac{2w}{\\cosh 2y - \\cos 2x} \\cdot (\\sin x \\cosh y,\\ -\\cos x \\sinh y)',
  },
  cschVar: {
    summary:
      'Complex hyperbolic cosecant of the input treated as a complex number, with a guarded denominator, scaled by the weight.',
    tex: 'V = \\tfrac{2w}{\\cosh 2x - \\cos 2y} \\cdot (\\sinh x \\cos y,\\ -\\cosh x \\sin y)',
  },
  cschqVar: {
    summary:
      'A quaternion-flavored hyperbolic cosecant using the y component as imaginary magnitude, dividing sinh and cosh of x by the squared norm and applying a sinc-weighted term for the y output, scaled by the weight.',
    tex: 'V = \\tfrac{w}{x^2+y^2} \\cdot (\\sinh x \\cos y,\\ -\\cosh x \\sin y)',
  },
  cscqVar: {
    summary:
      'A quaternion-flavored cosecant using the y component as imaginary magnitude, dividing sine and cosh terms by the squared norm with a sinc-weighted y output, scaled by the weight.',
    tex: 'V = \\tfrac{w}{x^2+y^2}\\,(\\sin x \\cosh|y|,\\ -\\cos x \\sinh|y|\\,\\operatorname{sgn} y)',
  },
  cylinder2Var: {
    summary:
      'Wraps the x coordinate onto a cylinder by dividing it by sqrt of x squared plus one while leaving y unchanged, scaled by the weight.',
    tex: 'V = w \\cdot (\\tfrac{x}{\\sqrt{x^2 + 1}},\\ y)',
  },
  cylinderApoVar: {
    summary:
      'Apophysis-style cylinder that replaces the x coordinate with its sine and keeps y unchanged, scaled by the weight.',
    tex: 'V = w \\cdot (\\sin x,\\ y)',
  },
  dustpointVar: {
    summary:
      'A randomized iterated function system that with varying probability either applies an inverted radial fold with a random vertical sign flip, contracts the point toward the origin, or contracts and shifts it rightward. Produces a fractal dust pattern.',
  },
  easeVar: {
    summary:
      'Remaps each coordinate from minus one..one to zero..one, applies the smoothstep easing curve, and blends the eased displacement back onto the original point with strength set by the weight.',
    tex: 'e(u) = u^2(3 - 2u)',
  },
  ediscVar: {
    summary:
      'An elliptic disc map. It converts the point to elliptic coordinates, takes a logarithmic radial component and an inverse-cosine angular component, then applies hyperbolic and trigonometric functions to remap the disc, flipping sign when y is positive.',
    tex: 'x_m = \\tfrac{\\sqrt{r^2+1+2x}+\\sqrt{r^2+1-2x}}{2},\\ a_1 = \\ln(x_m+\\sqrt{x_m-1}),\\ a_2 = -\\arccos\\tfrac{x}{x_m};\\quad V = w\\,(\\cosh a_2 \\cos a_1,\\ -\\operatorname{sgn}(y)\\,\\sinh a_2 \\sin a_1)',
  },
  ennepersVar: {
    summary:
      'Applies an Enneper-surface style cubic polynomial map, subtracting a cubed term and adding a cross term in each component.',
    tex: 'V = w\\,(x - \\tfrac{x^3}{3} + x y^2,\\ \\ y - \\tfrac{y^3}{3} + y x^2)',
  },
  fanVar: {
    summary:
      'A fan map that splits the plane into angular wedges of size derived from the affine coefficients, then rotates the polar angle by half a wedge in one direction or the other depending on which half of the wedge the angle falls in.',
    tex: 't = \\pi c^2;\\quad V = w\\,r\\,(\\cos(\\theta \\pm \\tfrac{t}{2}),\\ \\sin(\\theta \\pm \\tfrac{t}{2}))',
  },
  flipCircleVar: {
    summary:
      'Flips the y coordinate across the x axis only for points outside a circle of radius equal to the weight, leaving points inside the circle unchanged.',
    tex: 'V = (x,\\ s\\,y),\\quad s = -1\\ \\text{if}\\ x^2+y^2 \\le w^2,\\ \\text{else}\\ 1',
  },
  flipYVar: {
    summary:
      'Flips the sign of the y coordinate for points with positive x, leaving points with non-positive x unchanged, then scales by the weight.',
    tex: 'V = w\\,(x,\\ s\\,y),\\quad s = -1\\ \\text{if}\\ x>0,\\ \\text{else}\\ 1',
  },
  glynniaVar: {
    summary:
      'A two-region map that uses a square-root branch for points inside the unit circle and a reciprocal branch outside, with the x sign chosen by region and the branch selected randomly, producing a scattered dual texture.',
  },
  gridoutVar: {
    summary:
      'Snaps points outward onto a grid by shifting each point by one unit in x or y; the chosen direction depends on the sign of the rounded coordinates and which diagonal half the point lies in.',
  },
  hadamardVar: {
    summary:
      'A random three-way contraction that halves the coordinates in one branch and mixes and offsets the x and y components in the other two, producing a self-similar fractal pattern.',
  },
  holesqVar: {
    summary:
      'A square hole map that leaves points outside the unit diamond unchanged and folds points inside it toward the edges, choosing the fold per quadrant based on which absolute coordinate is larger.',
  },
  invpolarVar: {
    summary:
      'An inverse polar map that treats x as an angle scaled by pi and one plus y as a radius, producing a sine and cosine pair scaled by that radius.',
    tex: 'V = w\\,((1+y)\\sin(\\pi x),\\ \\ (1+y)\\cos(\\pi x))',
  },
  invsquircularVar: {
    summary:
      'The inverse of the squircular map, converting a square-like region back toward a circular disc using a radial square-root expression divided by the coordinates and the weight.',
    tex: 'V = \\tfrac{1}{w}\\sqrt{\\tfrac{r-\\sqrt{r\\,(w^2 r-4x^2y^2)/w}}{2}}\\,(\\tfrac{1}{x},\\ \\tfrac{1}{y}),\\quad r=x^2+y^2',
  },
  invtreeVar: {
    summary:
      'A random three-way map combining a halving branch with two reciprocal-style branches that map each coordinate through forms like c over c plus one, building a branching tree texture.',
  },
  laceVar: {
    summary:
      'A random three-fold map that reflects the point about one of three centers arranged at the vertices of an equilateral triangle, scaling the reflected radius by one half, weaving a lace-like symmetric pattern.',
  },
  logVar: {
    summary:
      'A complex logarithm map sending the point to half the log of its squared radius in x and its polar angle in y.',
    tex: 'V = w\\,(\\tfrac{1}{2}\\ln(r^2),\\ \\ \\theta)',
  },
  loonie3Var: {
    summary:
      'A variant of the loonie map that inflates points inside a radius threshold onto a circle and passes points outside through scaled by the weight, using a squared-distance-over-x-squared radial measure.',
  },
  minkVar: {
    summary:
      'Folds the coordinates through five iterations of a Minkowski-sausage style fractional fold, taking fractional parts and flipping them on alternating integer cells, then blends the folded result back with the original point.',
  },
  noiseVar: {
    summary:
      'Scatters each point by a random radius and a random angle, multiplying x by the cosine and y by the sine of that angle, producing a noisy cloud.',
  },
  panorama1Var: {
    summary:
      'A panorama projection that first maps the point onto a sphere using one over the square root of r squared plus one, then outputs the resulting angle scaled by one over pi in x and the projected radius minus one half in y.',
    tex: 'V = w\\,(\\tfrac{1}{\\pi}\\arctan\\tfrac{x}{y},\\ \\tfrac{r}{\\sqrt{r^2+1}}-\\tfrac{1}{2})',
  },
  panorama2Var: {
    summary:
      'A panorama projection like panorama1 but normalizing by one over the radius plus one rather than the spherical form, outputting the angle scaled by one over pi in x and the projected radius minus one half in y.',
    tex: 'V = w\\,(\\tfrac{1}{\\pi}\\arctan\\tfrac{x}{y},\\ \\tfrac{r}{r+1}-\\tfrac{1}{2})',
  },
  petalVar: {
    summary:
      'A petal map built from cosines of x and y, combining cubed products of trig terms scaled by cosine of x to form flower-petal shapes.',
    tex: 'V = w\\,(\\cos x\\,(\\cos x\\cos y)^3,\\ \\ \\cos x\\,(\\sin x\\cos y)^3)',
  },
  polar2Var: {
    summary:
      'A second polar map outputting the polar angle scaled by one over pi in x and half the log of the squared radius scaled by one over pi in y.',
    tex: 'V = w\\,(\\tfrac{\\theta}{\\pi},\\ \\ \\tfrac{\\ln(r^2)}{2\\pi})',
  },
  rays1Var: {
    summary:
      'A rays map that scales the inverse of each coordinate by the squared radius times a factor built from the cotangent of the radius plus a weight term, producing radial rays.',
    tex: 't = x^2+y^2,\\ u = \\cot\\sqrt{t} + w\\,\\tfrac{4}{\\pi^2};\\quad V = u\\,t\\,(\\tfrac{1}{x},\\ \\tfrac{1}{y})',
  },
  rays2Var: {
    summary:
      'A rays map that scales the inverse of each coordinate by one tenth of the squared radius times the secant of the squared radius times the tangent of its reciprocal, producing radial ray streaks.',
    tex: 't = x^2+y^2;\\quad V = \\tfrac{w\\,t}{10}\\sec\\!\\big(t\\tan\\tfrac{1}{t}\\big)\\,(\\tfrac{1}{x},\\ \\tfrac{1}{y})',
  },
  rays3Var: {
    summary:
      'A rays map that scales the inverse of each coordinate by a factor built from one over the square root of a nested cosine and sine expression, modulating x by cosine of the squared radius and y by its tangent.',
    tex: 't = x^2+y^2;\\quad V = \\tfrac{w\\,t}{10\\sqrt{\\cos(\\sin t^2 \\sin\\tfrac{1}{t^2})}}\\,(\\tfrac{\\cos t}{x},\\ \\tfrac{\\tan t}{y})',
  },
  riftVar: {
    summary:
      'Creates a tear in coordinate space by applying a random offset scaled by the weight only to points whose Manhattan distance from the origin is below a threshold, leaving farther points unchanged.',
  },
  ringsVar: {
    summary:
      'A rings map that wraps the radius into concentric bands of width set by the squared affine c coefficient, then places the point back on its polar direction at the wrapped radius.',
    tex: 'f = ((r+c^2)\\bmod 2c^2) - c^2 + r\\,(1-c^2);\\quad V = w\\,f\\,(\\cos\\theta,\\ \\sin\\theta)',
  },
  rippledVar: {
    summary:
      'A ripple map that scales x by the hyperbolic tangent of the squared radius and y by the cosine of the squared radius, producing concentric ripples.',
    tex: 'V = w\\,(\\tanh(r^2)\\,x,\\ \\ \\cos(r^2)\\,y)',
  },
  rondspherVar: {
    summary:
      'A round-sphere map that divides each coordinate by the squared radius times a factor of one over the squared radius plus the square of two over pi, contracting points toward the origin.',
    tex: 'd = x^2+y^2,\\ e = \\tfrac{1}{d}+(\\tfrac{2}{\\pi})^2;\\quad V = \\tfrac{w}{d\\,e}\\,(x,\\ y)',
  },
  roundSpherVar: {
    summary:
      'A round-sphere map that scales each coordinate by the weight divided by the squared radius times a factor of one over the squared radius plus four over pi squared, contracting points toward the origin.',
    tex: 'd = x^2+y^2,\\ e = \\tfrac{1}{d}+\\tfrac{4}{\\pi^2};\\quad V = \\tfrac{w}{d\\,e}\\,(x,\\ y)',
  },
  secVar: {
    summary:
      'Complex secant of the point, with the denominator cos(2x) plus cosh(2y) guarded against near-zero values, scaling the pair (cos x cosh y, sin x sinh y).',
    tex: 'V = \\tfrac{2}{\\cos 2x + \\cosh 2y}\\,(\\cos x \\cosh y,\\ \\sin x \\sinh y)',
  },
  secant2Var: {
    summary:
      'A secant-based curve that keeps x unchanged and replaces y with the reciprocal of cos(r) where r is the weighted radius, offset up or down by one depending on the sign of that reciprocal.',
    tex: 'V = (x,\\ \\sec r - \\operatorname{sgn}(\\sec r)),\\ r = weight\\sqrt{x^2+y^2}',
  },
  sechVar: {
    summary:
      'Complex hyperbolic secant of the point, with denominator cos(2y) plus cosh(2x), scaling the pair (cos y cosh x, minus sin y sinh x).',
    tex: 'V = \\tfrac{2}{\\cos 2y + \\cosh 2x}\\,(\\cos y \\cosh x,\\ -\\sin y \\sinh x)',
  },
  sechqVar: {
    summary:
      'A quaternion-flavored hyperbolic secant treating y as the imaginary magnitude. It scales cosh x cos magnitude by the inverse squared norm for x, and folds a sinh-times-sin term divided by the magnitude into y.',
    tex: 'V = \\frac{weight}{x^2+y^2}(\\cosh x\\cos y,\\ -\\sinh x\\sin y)',
  },
  secqVar: {
    summary:
      'A quaternion-flavored secant using minus x for the trig terms and the y-magnitude for the hyperbolic terms, scaling cos times cosh by the inverse squared norm for x and folding a sin-times-sinh term divided by the magnitude into y.',
    tex: 'V = \\frac{weight}{x^2+y^2}(\\cos x\\cosh y,\\ \\sin x\\sinh y)',
  },
  sinVar: {
    summary:
      'Complex sine of the point, mapping it to (sin x cosh y, cos x sinh y) scaled by the weight.',
    tex: 'V = (\\sin x \\cosh y,\\ \\cos x \\sinh y)',
  },
  sinhVar: {
    summary:
      'Complex hyperbolic sine of the point, mapping it to (sinh x cos y, cosh x sin y) scaled by the weight.',
    tex: 'V = (\\sinh x \\cos y,\\ \\cosh x \\sin y)',
  },
  sinhqVar: {
    summary:
      'A quaternion-flavored hyperbolic sine treating y as the imaginary magnitude. The x output is sinh x times cos magnitude, and the y output multiplies y by cosh x times sin magnitude divided by that magnitude.',
    tex: 'V = weight\\,(\\sinh x\\cos y,\\ \\cosh x\\sin y)',
  },
  sinqVar: {
    summary:
      'A quaternion-flavored sine treating y as the imaginary magnitude. The x output is sin x times cosh magnitude, and the y output multiplies y by cos x times sinh magnitude divided by that magnitude.',
    tex: 'V = weight\\,(\\sin x\\cosh y,\\ \\cos x\\sinh y)',
  },
  spiralwingVar: {
    summary:
      'A spiral wing shape using the squared coordinates: it divides by the squared radius and modulates by sin of y squared, producing the pair (cos of x squared, sin of x squared) times that sine.',
    tex: 'V = \\tfrac{\\sin(y^2)}{x^2+y^2}\\,(\\cos(x^2),\\ \\sin(x^2))',
  },
  tanCosVar: {
    summary:
      'Combines a hyperbolic tangent in x with a cosine in y, each divided by the squared radius and doubled: the x channel uses tanh of the squared radius and the y channel uses cos of it.',
    tex: 'V = \\tfrac{2}{r^2}\\,(\\tanh(r^2)\\,x,\\ \\cos(r^2)\\,y)',
  },
  tanVar: {
    summary:
      'Complex tangent of the point, where a shared denominator of cos(2x) plus cosh(2y) scales the pair (sin(2x), sinh(2y)).',
    tex: 'V = \\tfrac{1}{\\cos 2x + \\cosh 2y}\\,(\\sin 2x,\\ \\sinh 2y)',
  },
  tanhqVar: {
    summary:
      'A quaternion-flavored hyperbolic tangent treating y as the imaginary magnitude, forming the full complex tangent ratio from sinh and cosh of x with sin and cos of the magnitude, normalized by the inverse squared norm.',
  },
  threePointIFSVar: {
    summary:
      'A randomized three-map iterated function system: with probabilities one third, four ninths, and two ninths it picks one of three affine maps to send the point toward one of three attractor regions.',
  },
  tornadoVar: {
    summary:
      'A vertical vortex swirl whose rotation angle grows as the point nears the center, given by one minus the radius times three pi times the weight. The point is rotated by that angle and pushed slightly upward in proportion to its radius.',
    tex: 'V = (x\\cos a - y\\sin a,\\ x\\sin a + y\\cos a + 0.1\\,t\\,r),\\ a = 3\\pi(1-r)t,\\ t = weight,\\ r = \\sqrt{x^2+y^2}',
  },
  wavesVar: {
    summary:
      'Adds sinusoidal displacement driven by the affine coefficients: the x shift is the b coefficient times sin of y over c squared, and the y shift is the e coefficient times sin of x over f squared.',
    tex: 'V = weight\\,(x + b\\sin(y/c^{2}),\\ y + e\\sin(x/f^{2}))',
  },
  wdiscVar: {
    summary:
      'A wedge-disc map where the radius output is the polar angle scaled by one over pi and the angle is pi over the radius plus one, flipped to its supplement when the normalized angle is positive.',
  },
  postFlattenVar: {
    summary:
      'Post transform that compresses the vertical range toward the center, dividing y by one plus twice the weight while leaving x unchanged.',
    tex: 'V = (x,\\ \\tfrac{y}{1 + 2w})',
  },
  postHeatHazeVar: {
    summary:
      'Post transform that adds a small crossed sinusoidal wave displacement to both axes to create a heat-haze distortion, then scales by the weight.',
  },
  postRotateVar: {
    summary:
      'Post transform that rotates the point about the origin by an angle equal to the weight.',
    tex: 'V = (x \\cos a - y \\sin a,\\ x \\sin a + y \\cos a)',
  },
  postSphericalVar: {
    summary:
      'Post transform applying a spherical inversion, scaling the point by the weight over its squared radius plus a small epsilon.',
    tex: 'V = \\tfrac{w}{x^2 + y^2}\\,(x,\\ y)',
  },
  postSpinZVar: {
    summary:
      'Post transform that rotates the point by an angle equal to the weight times pi over two.',
  },
  preBlurVar: {
    summary:
      'Pre transform that ignores the input and scatters a fresh point: the radius is the weight times a sum of six random numbers minus three, placed at a random angle, giving an approximately Gaussian blur.',
  },
  preDiscVar: {
    summary:
      'Pre transform applying a disc mapping, where the radius factor comes from the polar angle over pi times the weight and the angle from pi times the square root of the radius, producing concentric rings.',
  },
  preFlattenVar: {
    summary:
      'Pre transform that compresses the vertical range toward the center before the main transform, dividing y by one plus twice the weight while leaving x unchanged.',
    tex: 'V = (x,\\ \\tfrac{y}{1 + 2w})',
  },
  preGaussianSimpleVar: {
    summary:
      'Pre transform that ignores the input and emits a fresh Gaussian-distributed point using a Box-Muller transform of two random numbers, scaled by the weight.',
  },
  preRotateVar: {
    summary:
      'Pre transform that rotates the point about the origin by an angle equal to the weight.',
    tex: 'V = (x \\cos a - y \\sin a,\\ x \\sin a + y \\cos a)',
  },
  preSphericalVar: {
    summary:
      'Pre transform applying a spherical inversion, scaling the point by the weight over its squared radius plus a small epsilon.',
    tex: 'V = \\tfrac{w}{x^2 + y^2}\\,(x,\\ y)',
  },
  preSpinZVar: {
    summary:
      'Pre transform that rotates the point by an angle equal to the weight times pi over two.',
  },
}
