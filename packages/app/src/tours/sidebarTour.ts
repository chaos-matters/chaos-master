import { openSidebar, openSidebarScrollTo, openTimeline, tourTarget, } from './stepFactory'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'

export const sidebarTour: TourGuide = {
  id: 'sidebar',
  name: 'Sidebar Tour',
  description:
    'Master the sidebar — edit transforms, tweak variations, animate with keyframes, and switch to compact mode.',
  nextTourId: 'timeline',
  nextTourLabel: 'Timeline Tour',
  steps: [
    {
      target: tourTarget('sidebar'),
      title: 'The Sidebar',
      description:
        'All flame parameters are edited here. Press Ctrl+S to show or hide the sidebar. Each transform has affine coefficients, probability, and variation slots.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('affine-tabs'),
      title: 'Affine Coefficients',
      description:
        'Pre and post affine transforms control position, rotation, and scale for each transform. Switch between Grid and List views, and toggle Pre/Post to edit the transform applied before or after variations.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('affine-mode'),
      title: 'Pre / Post Transform',
      description:
        'Switch between editing the Pre-Transform (applied before variations) and the Post-Transform (applied after variations). The post-transform lets you warp the output of non-linear variations independently.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('probability'),
      title: 'Probability & Diamonds',
      description:
        'Adjusts how often a transform fires relative to others. The diamond icon next to it tracks animation keyframes — click to insert or remove a keyframe at the current frame.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('variation-type'),
      title: 'Variations',
      description:
        'Each transform can have multiple stacked variations. Click the variation name to change its type or access type-specific parameters.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('variation-weight'),
      title: 'Variation Weight',
      description:
        'Controls how strongly a variation influences the transform. The keyframe diamond lets you animate this weight over time — visible in both compact and full modes.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('add-symmetry'),
      title: 'Add Symmetry',
      description:
        'Instantly wrap the flame in rotational (or dihedral) symmetry. This adds linked symmetry transforms — a Symmetry card then appears where you can change the type and fold count. A fast way to turn any flame into a kaleidoscopic, mandala-like pattern.',
      beforeShow: openSidebarScrollTo('add-symmetry'),
    },
    {
      target: tourTarget('randomizer-card'),
      title: 'Randomize & Mutate',
      description:
        'Generate brand-new flames or nudge the current one. Randomize creates a fresh flame from scratch; Mutate makes small variations on what you have. The history strip remembers recent results so you can step back to a version you liked.',
      beforeShow: openSidebarScrollTo('randomizer-card'),
    },

    {
      target: tourTarget('auto-keyframe'),
      title: 'Auto Keyframe Mode',
      description:
        'When Auto is enabled, any change to a property that already has keyframes automatically inserts a new keyframe at the current frame. To record from scratch, flip on the shiny "Track changes" diamond in the affine or color editor — every edit, dice roll, and handle drag then drops keyframes at the current frame, perfect for building an animation move by move.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('sidebar'),
      title: 'Insert Keyframes',
      description:
        'Click the diamond icon next to a property to insert a keyframe at the current frame. This is the fastest way to build up an animation — click a param, click its diamond, repeat.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('metadata-card'),
      title: 'Metadata',
      description:
        'Give your flame a name, description, and author. This metadata is embedded into exported PNGs and shared links, so others see the credit and details when they load your flame.',
      beforeShow: openSidebarScrollTo('metadata-card'),
    },
  ],
}
