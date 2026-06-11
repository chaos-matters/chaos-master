import { DEFAULT_ANIMATION_DURATION_MS } from '@/components/SpotlightTour/tourTypes'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'

/**
 * Example 2 -- "Spirals & Color"
 *
 * Creates a vivid spiral fractal using juliaN and curl variations.
 * The tour showcases parametric variation controls, affine handle
 * animation, and render-settings tuning (vibrancy, gamma, contrast).
 *
 * Design goals:
 *  - Fewer transforms than Example 1 (just 2), so each step is dramatic.
 *  - Heavily animated parametric sliders (juliaN power, curl c1/c2).
 *  - Big affine rotations so the user sees handles sweeping around.
 *  - Vibrancy / gamma / contrast polish at the end.
 */

/** Grace period (ms) after the spotlight lands before slider animation begins. */
const GRACE_MS = 600

/** Slightly longer animation for sweeping affine / parametric changes. */
const SLOW_MS = 1800

export const example2CreationTour: TourGuide = {
  id: 'example2-creation',
  name: 'Example 2: Spirals & Color',
  description:
    'Build a colorful spiral fractal using juliaN and curl -- two powerful parametric variations.',
  noBlur: true,
  steps: [
    // -----------------------------------------------------------
    //  SETUP
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="canvas"]',
      title: 'Starting Fresh',
      description:
        'We begin from a blank canvas with Skip Iterations set to 5 so structure emerges quickly. This tour builds a vivid spiral using just two transforms.',
      beforeShow: (ctx) => {
        ctx.setSidebarOpen(true)
        ctx.executeCommand('flame.clearTransforms')
        ctx.executeCommand('flame.setSkipIters', 5)
        ctx.executeCommand('flame.setExposure', 0.25)
        ctx.executeCommand('flame.setDrawMode', 'light')
        ctx.executeCommand('flame.setVibrancy', 0.5)
        ctx.executeCommand('flame.setGamma', 2.2)
        ctx.executeCommand('flame.setContrast', 1)
        ctx.executeCommand('camera.center')
        ctx.executeCommand('camera.zoomTo', 1)
      },
    },

    // -----------------------------------------------------------
    //  TRANSFORM 1 -- juliaN
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="canvas"]',
      title: 'T1: Add juliaN Transform',
      description:
        'JuliaN creates n-fold rotational symmetry -- think of a kaleidoscope. We start with power=3 and dist=1 for a classic three-armed spiral.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addTransform', 'juliaNVar')
        ctx.executeCommand('flame.setColorSpeed', 0, 0.5)
        ctx.executeCommand('flame.setVariationParams', 0, 0, 'power', 3)
        ctx.executeCommand('flame.setVariationParams', 0, 0, 'dist', 1)
      },
    },
    {
      target: '[data-tour-target="affine-editor"]',
      title: 'T1: Shape the Spiral',
      description:
        'Watch the affine handles sweep as we scale and rotate T1. The asymmetric scaling (a=0.75, e=0.85) stretches the spiral arms, while the slight shear (b=0.15) gives them a natural curve.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="affine-editor"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.75, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'a', val)
        })
        ctx.animateValue(0, 0.15, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'b', val)
        })
        ctx.animateValue(0, -0.1, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'c', val)
        })
        ctx.animateValue(0, -0.2, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'd', val)
        })
        ctx.animateValue(1, 0.85, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 0, 'pre', 'e', val)
        })
        ctx.executeCommand('flame.setAffine', 0, 'pre', 'f', 0)
        ctx.executeCommand('flame.setTransformColor', 0, 0.15, 0.3)
      },
    },
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T1: Probability -> 60%',
      description:
        'T1 fires more often than T2 will, making the spiral structure the dominant feature. The color is set warm (left side of the palette).',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.6, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setProbability', 0, val)
        })
      },
    },

    // -----------------------------------------------------------
    //  TRANSFORM 2 -- Curl
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="canvas"]',
      title: 'T2: Add Curl Transform',
      description:
        'Curl is a conformal mapping that twists space around fixed points. Combined with juliaN, it produces rich interference patterns and flowing detail in the spiral gaps.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addTransform', 'curlVar')
        ctx.executeCommand('flame.setColorSpeed', 1, 0.6)
        ctx.executeCommand('flame.setVariationParams', 1, 0, 'c1', 0.5)
        ctx.executeCommand('flame.setVariationParams', 1, 0, 'c2', 0)
        ctx.executeCommand('flame.setTransformColor', 1, 0.7, 0.5)
      },
    },
    {
      target: '[data-tour-target="affine-editor"]',
      title: 'T2: Position the Curl',
      description:
        'The pre-affine matrix controls where the curl effect is centered. We scale it down and offset it to weave detail between the juliaN arms.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="affine-editor"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.65, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'a', val)
        })
        ctx.animateValue(0, 0.3, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'b', val)
        })
        ctx.animateValue(0, -0.25, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'c', val)
        })
        ctx.animateValue(0, -0.3, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'd', val)
        })
        ctx.animateValue(1, 0.7, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'e', val)
        })
        ctx.animateValue(0, 0.15, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setAffine', 1, 'pre', 'f', val)
        })
      },
    },
    {
      target: '[data-tour-target="probability"]',
      targetLast: true,
      title: 'T2: Probability -> 40%',
      description:
        'T2 fires less often, so the curl detail appears as subtle filigree woven through the dominant spiral arms.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="probability"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 0.4, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setProbability', 1, val)
        })
      },
    },

    // -----------------------------------------------------------
    //  PARAMETRIC EXPLORATION -- JuliaN power
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="variation-type"]',
      title: 'Exploring juliaN: Power',
      description:
        'The Power parameter controls how many spiral arms appear. Watch it sweep from 3 to 5 -- each increment adds another arm to the symmetry.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="variation-type"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(3, 5, SLOW_MS, (val) => {
          ctx.executeCommand(
            'flame.setVariationParams',
            0,
            0,
            'power',
            Math.round(val),
          )
        })
      },
    },
    {
      target: '[data-tour-target="variation-type"]',
      title: 'Exploring juliaN: Dist',
      description:
        'Dist controls how far points scatter from the center. Increasing it from 1 to 2.5 opens the spiral, creating more separation between the arms and revealing the internal structure.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="variation-type"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 2.5, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setVariationParams', 0, 0, 'dist', val)
        })
      },
    },

    // -----------------------------------------------------------
    //  PARAMETRIC EXPLORATION -- Curl c1
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="variation-type"]',
      targetLast: true,
      title: 'Exploring Curl: C1',
      description:
        'C1 controls the curl strength. Sweeping from 0.5 to 2.0 tightens the conformal twist, pulling detail into the spiral centers and creating dense vortex structures.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="variation-type"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(0.5, 2.0, SLOW_MS, (val) => {
          ctx.executeCommand('flame.setVariationParams', 1, 0, 'c1', val)
        })
      },
    },

    // -----------------------------------------------------------
    //  ADD LINEAR TO T2 for blending
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="variation-weight"]',
      targetLast: true,
      title: 'T2: Blend in Linear',
      description:
        'Adding a small Linear component (weight 0.3) to T2 softens the curl distortion. It mixes the twisted coordinates with the original position, preventing the detail from collapsing into singularities.',
      beforeShow: (ctx) => {
        ctx.executeCommand('flame.addVariation', 1, 'linearVar')
        ctx.executeCommand('flame.setVariationWeight', 1, 1, 0.3)
        ctx.scrollToTarget('[data-tour-target="variation-weight"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        // Reduce curl weight to balance with linear
        ctx.animateValue(1, 0.7, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setVariationWeight', 1, 0, val)
        })
      },
    },

    // -----------------------------------------------------------
    //  RESOLVING -- Skip Iterations
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="skipIters-slider"]',
      title: 'Resolving Detail',
      description:
        'Skip Iterations controls how many initial points are discarded before drawing. Cranking it to 15 eliminates the diffuse haze and reveals crisp, clean spiral arms.',
      position: 'top',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="skipIters-slider"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(5, 15, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setSkipIters', Math.round(val))
        })
      },
    },

    // -----------------------------------------------------------
    //  RENDER POLISH -- Gamma
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="gamma-slider"]',
      title: 'Polish: Gamma -> 2.8',
      description:
        'Gamma shapes the brightness curve. A higher value (2.8) lifts the midtones, making faint spiral detail visible without blowing out the bright areas.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="gamma-slider"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(2.2, 2.8, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setGamma', val)
        })
      },
    },

    // -----------------------------------------------------------
    //  RENDER POLISH -- Vibrancy
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="vibrancy-slider"]',
      title: 'Polish: Vibrancy -> 0.9',
      description:
        'Vibrancy saturates colors toward the palette. At 0.9 the spiral bursts with vivid color -- each arm takes on a distinct hue from the palette gradient.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="vibrancy-slider"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(0.5, 0.9, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setVibrancy', val)
        })
      },
    },

    // -----------------------------------------------------------
    //  RENDER POLISH -- Contrast
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="contrast-slider"]',
      title: 'Polish: Contrast -> 1.4',
      description:
        'Boosting contrast deepens the blacks between spiral arms and brightens the dense detail. The spiral pops against the dark background.',
      beforeShow: (ctx) => {
        ctx.scrollToTarget('[data-tour-target="contrast-slider"]')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 1.4, DEFAULT_ANIMATION_DURATION_MS, (val) => {
          ctx.executeCommand('flame.setContrast', val)
        })
      },
    },

    // -----------------------------------------------------------
    //  TIMELINE ANIMATION
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="timeline-section"]',
      title: 'Animate Variation Weight',
      description:
        'Finally, lets animate the juliaN variation weight over 90 frames. Watch how the spiral morphs as the weight interpolates from 100% down to 0% and back!',
      beforeShow: (ctx) => {
        ctx.setTimelineOpen(true)

        type SnapshotType = {
          transforms: Record<string, { variations: Record<string, unknown> }>
        }
        const snapshot = ctx.snapshotFlame() as SnapshotType
        const tid = Object.keys(snapshot.transforms)[0] as string
        const vid = Object.keys(
          snapshot.transforms[tid]!.variations,
        )[0] as string
        const paramPath = `${tid}.${vid}`

        ctx.executeCommand(
          'timeline.addKeyframe',
          paramPath,
          1.0,
          0,
          'easeInOut',
        )
        ctx.executeCommand(
          'timeline.addKeyframe',
          paramPath,
          0.7,
          20,
          'easeInOut',
        )
        ctx.executeCommand(
          'timeline.addKeyframe',
          paramPath,
          0.35,
          40,
          'easeInOut',
        )
        ctx.executeCommand(
          'timeline.addKeyframe',
          paramPath,
          0.6,
          60,
          'easeInOut',
        )
        ctx.executeCommand(
          'timeline.addKeyframe',
          paramPath,
          0.9,
          80,
          'easeInOut',
        )
        ctx.executeCommand(
          'timeline.addKeyframe',
          paramPath,
          1.0,
          90,
          'easeInOut',
        )

        ctx.executeCommand('timeline.setDuration', 90)
        ctx.executeCommand('timeline.setFps', 15)
        ctx.executeCommand('timeline.setLoop', false)
        ctx.executeCommand('timeline.setAnimationEnabled', true)
        ctx.executeCommand('timeline.play')
      },
    },

    // -----------------------------------------------------------
    //  FINAL -- Camera zoom
    // -----------------------------------------------------------
    {
      target: '[data-tour-target="canvas"]',
      title: 'Your Spiral Flame',
      description:
        'That is it -- a vivid spiral fractal built from just two transforms. JuliaN provides the rotational symmetry, Curl adds flowing detail, and the render settings bring it to life. Experiment with Power, Dist, and the affine handles to create your own variations!',
      beforeShow: (ctx) => {
        ctx.executeCommand('camera.center')
      },
      animationDelay: GRACE_MS,
      onAnimate: (ctx) => {
        ctx.animateValue(1, 1.3, SLOW_MS, (val) => {
          ctx.executeCommand('camera.zoomTo', val)
        })
      },
    },
  ],
}
