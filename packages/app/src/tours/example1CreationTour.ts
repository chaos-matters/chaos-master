import { DEFAULT_ANIMATION_DURATION_MS } from '@/components/SpotlightTour/tourTypes'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'

/**
 * Granular step-by-step tour that recreates Example 1 from scratch.
 *
 * Each step changes ONE thing and the spotlight moves to the element
 * that just changed. Slider values animate over DEFAULT_ANIMATION_DURATION_MS.
 *
 * Lifecycle per step:
 *   1. `beforeShow`  -- runs immediately: sets values, scrolls sidebar
 *   2.  spotlight lands on the target element
 *   3.  `animationDelay` ms elapse (user reads the description)
 *   4. `onAnimate`   -- starts slider/value animations
 */

/** Grace period (ms) after the spotlight lands before slider animation begins. */
const ANIMATION_GRACE_MS = 500

export const example1CreationTour: TourGuide = {
  id: 'example1-creation',
  name: 'Example 1 Creation',
  description:
    'Recreate the very first example flame step-by-step from scratch.',
  noBlur: true,
  steps: [
    // -----------------------------------------------------------
    //  SETUP
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="canvas"]',
      title: 'Building Example 1',
      description:
        'We start from a blank canvas. All transforms have been cleared and Skip Iterations is set to 1 so you can watch the flame evolve as we add each piece.',
      beforeShow: (ctx) => {
        ctx.setSidebarOpen(true)
        ctx.executeCommand('flame.clearTransforms')
        ctx.executeCommand('flame.setSkipIters', 1)
        ctx.executeCommand('flame.setExposure', 0.25)
        ctx.executeCommand('flame.setDrawMode', 'light')
        ctx.executeCommand('camera.center')
        ctx.executeCommand('camera.zoomTo', 1)
      },
    },

    // -----------------------------------------------------------
    //  TRANSFORM 1 -- Linear
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T1: Add Linear Transform',
      description:
        'A new transform appears with the default Linear variation and colorSpeed set to 0.4. Linear is the stable backbone that maps points without distortion.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addTransform', 'linear')
        ctx.executeCommand('flame.setColorSpeed', 0, 0.4)
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
    },
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T1: Probability -> 40%',
      description:
        'Probability controls how often this transform is chosen by the chaos game. We lower it to 40% to leave room for the other three transforms we will add.',
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.4, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setProbability', 0, val)
        })
      },
    },
    {
      target: '[data-tour-target="affine-editor"]',
      title: 'T1: Shrink & Offset',
      description:
        'The pre-affine matrix positions and scales this transform. We shrink it (a=0.8, e=0.6) and shift it right (c=0.5). Watch the affine handles move in the grid.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="affine-editor"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        // Animate the primary scale coefficient; set others instantly
        ctx.animateValue(1, 0.8, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'a', val)
        })
        ctx.animateValue(0, 0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'c', val)
        })
        ctx.animateValue(1, 0.6, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'e', val)
        })
        ctx.executeCommand('flame.setAffine', 0, 'pre', 'b', 0)
        ctx.executeCommand('flame.setAffine', 0, 'pre', 'd', 0)
        ctx.executeCommand('flame.setAffine', 0, 'pre', 'f', 0)
        ctx.executeCommand('flame.setTransformColor', 0, 0.1, 0.25)
      },
    },

    // -----------------------------------------------------------
    //  TRANSFORM 2 -- Linear + Swirl + Popcorn
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T2: Add Second Transform',
      description:
        'A second transform starts as plain Linear. We will mix in Swirl and Popcorn to create spiraling arms with organic texture.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addTransform', 'linear')
        ctx.executeCommand('flame.setColorSpeed', 1, 0.4)
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
    },
    {
      target: '[data-tour-target="variation-weight"]',
      targetLast: true,
      title: 'T2: Linear Weight -> 0.4',
      description:
        'Reducing the Linear weight to 0.4 makes room for Swirl and Popcorn. The variation weights control how much each one contributes to the final mapped position.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="variation-weight"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.4, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setVariationWeight', 1, 0, val)
        })
      },
    },
    {
      target: '[data-tour-target="variation-type"]',
      targetLast: true,
      title: 'T2: Add Swirl (0.5)',
      description:
        'Swirl twists points around the origin. At weight 0.5 it dominates the mix, creating the spiraling structure that defines Example 1.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addVariation', 1, 'swirl')
        ctx.executeCommand('flame.setVariationWeight', 1, 1, 0.5)
        ctx.scrollToTarget('[data-tour-target="variation-type"]')
      },
    },
    {
      target: '[data-tour-target="variation-type"]',
      targetLast: true,
      title: 'T2: Add Popcorn (0.1)',
      description:
        'Popcorn adds fine-grained sinusoidal distortion. A small weight of 0.1 gives subtle organic texture without overpowering the swirl.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addVariation', 1, 'popcorn')
        ctx.executeCommand('flame.setVariationWeight', 1, 2, 0.1)
        ctx.scrollToTarget('[data-tour-target="variation-type"]')
      },
    },
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T2: Probability -> 30%',
      description:
        'T2 fires less often than T1. The lower probability gives the swirl arms a lighter, more delicate presence.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.3, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setProbability', 1, val)
        })
      },
    },
    {
      target: '[data-tour-target="affine-editor"]',
      title: 'T2: Shear & Offset',
      description:
        'Shearing the pre-affine tilts the spiral (b=0.3) and offsets it vertically (f=0.5). Watch the handles shift and the swirl arms take shape.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="affine-editor"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.7, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'a', val)
        })
        ctx.animateValue(0, 0.3, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'b', val)
        })
        ctx.animateValue(0, 0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'f', val)
        })
        ctx.executeCommand('flame.setAffine', 1, 'pre', 'c', 0.1)
        ctx.executeCommand('flame.setAffine', 1, 'pre', 'd', 0)
        ctx.executeCommand('flame.setAffine', 1, 'pre', 'e', 0.6)
        ctx.executeCommand('flame.setTransformColor', 1, -0.3, 0.1)
      },
    },

    // -----------------------------------------------------------
    //  TRANSFORM 3 -- Pie + Gaussian
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T3: Add Pie Transform',
      description:
        'The Pie variation splits the plane into angular slices, like a pizza. Combined with the swirl, this creates the characteristic star shape.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addTransform', 'pie')
        ctx.executeCommand('flame.setColorSpeed', 2, 0.4)
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
    },
    {
      target: '[data-parameter-path$=".slices"]',
      title: 'T3: Pie Slices -> 5',
      description:
        'Five slices produce a clean pentagonal star pattern -- enough arms for visual interest without overcrowding. Watch the shape sharpen on the canvas.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-parameter-path$=".slices"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(6, 5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand(
            'flame.setVariationParams',
            2,
            0,
            'slices',
            Math.round(val),
          )
        })
      },
    },
    {
      target: '[data-tour-target="angle-rotation"]',
      title: 'T3: Rotation -> 0',
      description:
        'Pie defaults to 180-degree rotation. Setting it to 0 aligns the slices symmetrically around the origin.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="angle-rotation"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(Math.PI, 0, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setVariationParams', 2, 0, 'rotation', val)
        })
      },
    },
    {
      target: '[data-tour-target="variation-weight"]',
      targetLast: true,
      title: 'T3: Pie Weight -> 0.95',
      description:
        'Pie dominates at 0.95 weight so the star shape is clearly defined. The remaining 5% is reserved for a Gaussian softening.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="variation-weight"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.95, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setVariationWeight', 2, 0, val)
        })
      },
    },
    {
      target: '[data-tour-target="variation-type"]',
      targetLast: true,
      title: 'T3: Add Gaussian (0.05)',
      description:
        'A tiny Gaussian blur at 5% softens the hard edges of the pie slices, making transitions between arms look more natural.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addVariation', 2, 'gaussian')
        ctx.executeCommand('flame.setVariationWeight', 2, 1, 0.05)
        ctx.scrollToTarget('[data-tour-target="variation-type"]')
      },
    },
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T3: Probability -> 20%',
      description:
        'At 20% probability, the pie contributes detailed star structure without dominating the overall image.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.2, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setProbability', 2, val)
        })
      },
    },
    {
      target: '[data-tour-target="affine-editor"]',
      title: 'T3: Affine & Post-Affine',
      description:
        'The pre-affine shears the space. A 90-degree post-affine rotation gives the star its final orientation. These transforms work together to tilt the star into position.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="affine-editor"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        // Animate key coefficients for visual feedback
        ctx.animateValue(1, 0.6, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 2, 'pre', 'a', val)
        })
        ctx.animateValue(0, 0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 2, 'pre', 'b', val)
        })
        ctx.animateValue(0, -0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 2, 'pre', 'c', val)
        })
        ctx.executeCommand('flame.setAffine', 2, 'pre', 'd', 0)
        ctx.animateValue(1, 0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 2, 'pre', 'e', val)
        })
        ctx.animateValue(0, -0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 2, 'pre', 'f', val)
        })
        // Post-affine: 90-degree rotation
        ctx.executeCommand('flame.setAffine', 2, 'post', 'a', 0)
        ctx.executeCommand('flame.setAffine', 2, 'post', 'b', -1)
        ctx.executeCommand('flame.setAffine', 2, 'post', 'c', 0)
        ctx.executeCommand('flame.setAffine', 2, 'post', 'd', 1)
        ctx.executeCommand('flame.setAffine', 2, 'post', 'e', 0)
        ctx.executeCommand('flame.setAffine', 2, 'post', 'f', 0)
        ctx.executeCommand('flame.setTransformColor', 2, 0, -0.3)
      },
    },

    // -----------------------------------------------------------
    //  TRANSFORM 4 -- Sinusoidal
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T4: Add Sinusoidal Transform',
      description:
        'Sinusoidal bends the structure into soft sine waves, adding an organic ripple to the entire flame.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addTransform', 'sinusoidal')
        ctx.executeCommand('flame.setColorSpeed', 3, 0.4)
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
    },
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T4: Probability -> 10%',
      description:
        'At just 10%, sinusoidal fires rarely but adds a visible organic texture. This is the final transform -- all four are now in place.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.1, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setProbability', 3, val)
        })
      },
    },
    {
      target: '[data-tour-target="affine-editor"]',
      title: 'T4: Affine & Color',
      description:
        'The sinusoidal transform gets the same shearing as T3 plus its own color. The flame shape is complete but still very noisy at skip iterations = 1.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="affine-editor"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.6, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 3, 'pre', 'a', val)
        })
        ctx.animateValue(0, 0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 3, 'pre', 'b', val)
        })
        ctx.animateValue(0, -0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 3, 'pre', 'c', val)
        })
        ctx.executeCommand('flame.setAffine', 3, 'pre', 'd', 0)
        ctx.animateValue(1, 0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 3, 'pre', 'e', val)
        })
        ctx.animateValue(0, -0.5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 3, 'pre', 'f', val)
        })
        ctx.executeCommand('flame.setTransformColor', 3, 1, 0)
      },
    },

    // -----------------------------------------------------------
    //  RESOLVING THE CHAOS -- Skip Iterations
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="skipIters-slider"]',
      title: 'Resolving the Chaos (1/3)',
      description:
        'With Skip Iterations at 1, the image is pure noise. Watch the slider climb to 5 -- structure starts to emerge from the chaos.',
      position: 'top',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="skipIters-slider"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 5, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setSkipIters', Math.round(val))
        })
      },
    },
    {
      target: '[data-tour-target="skipIters-slider"]',
      title: 'Resolving the Chaos (2/3)',
      description:
        'At 10 iterations the spirals, pie slices, and sine waves become clearly visible. The colors begin to separate along the palette.',
      position: 'top',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="skipIters-slider"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(5, 10, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setSkipIters', Math.round(val))
        })
      },
    },
    {
      target: '[data-tour-target="skipIters-slider"]',
      title: 'Resolving the Chaos (3/3)',
      description:
        'Finally, 20 skip iterations -- exactly like the real Example 1. The flame is perfectly crisp and all detail is resolved.',
      position: 'top',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="skipIters-slider"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(10, 20, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setSkipIters', Math.round(val))
        })
      },
    },

    // -----------------------------------------------------------
    //  FINAL TOUCHES -- Gamma & Vibrancy
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="gamma-slider"]',
      title: 'Final Touch: Gamma -> 2.42',
      description:
        'Gamma controls the brightness curve. Pushing it to 2.42 lifts the midtones and makes the flame glow.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="gamma-slider"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(2.2, 2.42, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setGamma', val)
        })
      },
    },
    {
      target: '[data-tour-target="vibrancy-slider"]',
      title: 'Final Touch: Vibrancy -> 0.95',
      description:
        "Vibrancy saturates the colors toward the palette. At 0.95 the flame bursts with color -- you've just built Example 1 from scratch!",
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="vibrancy-slider"]')
      },
      animationDelay: ANIMATION_GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(0.5, 0.95, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setVibrancy', val)
        })
      },
    },
  ],
}
