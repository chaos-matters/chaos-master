import { openSidebarScrollTo, tourTarget } from './stepFactory'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'

export const appTour: TourGuide = {
  id: 'app',
  name: 'App Tour',
  description:
    'Get familiar with Chaos Master — the canvas, controls, and how to load, export, and share flames.',
  nextTourId: 'sidebar',
  nextTourLabel: 'Sidebar Tour',
  steps: [
    {
      target: tourTarget('canvas'),
      title: 'The Canvas',
      description:
        'Your fractal flame renders here with WebGPU. Use the mouse wheel to zoom and drag to pan around the flame.',
    },
    {
      target: tourTarget('view-controls'),
      title: 'View Controls',
      description:
        'Fine-tune resolution, zoom level, and camera position. Undo/redo buttons let you revert accidental changes.',
    },
    {
      target: tourTarget('load-flame'),
      title: 'Load a Flame',
      description:
        'Open the flame browser to pick from curated examples, recently viewed flames, or load a PNG or flame file from disk.',
    },
    {
      target: tourTarget('canvas'),
      title: 'Drag and Drop',
      description:
        'You can also drag and drop an exported PNG onto the canvas to load a flame directly, including any embedded animation data.',
    },
    {
      target: tourTarget('save-for-later'),
      title: 'Save for Later',
      description:
        'Bookmark the current flame to your recent list. Find it again from the welcome screen or the Load Flame browser.',
    },
    {
      target: tourTarget('export-png'),
      title: 'Export PNG',
      description:
        'Save your flame as a high-resolution PNG. Pick a resolution (1K / 2K / 4K) and an aspect ratio (Auto, 1:1, 16:9, 9:16, 4:3), tune quality, and optionally embed the flame data so others can load it. Exports render in the background — keep working while they finish, then grab them from the Exports panel that appears top-right.',
    },
    {
      target: tourTarget('quick-export'),
      title: 'Quick Export',
      description:
        'Instantly render and download your flame at a preset resolution without opening the export dialog.',
    },
    {
      target: tourTarget('share-link'),
      title: 'Share Link',
      description:
        'Generate a shareable URL that encodes your flame and optional animation data. Anyone with the link can load and play it.',
    },
    {
      target: tourTarget('logo-favicon'),
      title: 'Logo / Favicon Export',
      description:
        'Open the logo/favicon generator, which allows you to perfectly crop and export a tiny version of your flame optimized for use as a logo or website favicon.',
    },
    {
      target: tourTarget('randomize-colors'),
      title: 'Randomize Colors',
      description:
        'Breathe new life into your fractal by quickly cycling through different color palettes and gradients.',
    },
    {
      target: tourTarget('animation-toggle'),
      title: 'Play / Pause Animation',
      description:
        'Enable animation mode to bring your fractal to life. Click again to pause, or cycle through to disable animation mode entirely.',
    },
    {
      target: tourTarget('show-timeline'),
      title: 'Timeline Editor',
      description:
        'Open the timeline editor at the bottom of the screen to smoothly keyframe transforms and colors over time. You can export the result as a video — optionally rendered in the background (offscreen) so you can keep working while it encodes.',
    },
    {
      target: tourTarget('adaptive-filter'),
      title: 'Adaptive Filter',
      description:
        'Toggle the adaptive blur filter. When enabled, it dynamically smooths out noise in low-density areas of the flame.',
    },
    {
      target: tourTarget('quality-presets'),
      title: 'Quality Presets',
      description:
        'Quickly switch rendering quality limits. Higher quality resolves more detail and reduces noise, but takes longer to compute. Nearby you can also switch a flame between 2D and 3D, and (in 3D) enter Fly mode — WASD/arrows to move, Space/C for up/down, Q/E to roll. In 3D you can also enable "Auto exposure on zoom" so brightness stays consistent as you fly closer or further from the flame.',
    },
    {
      target: tourTarget('pointBatch-slider'),
      title: 'Point Batch (Performance)',
      description:
        'The renderer accumulates points in batched chains for speed. Point Batch sets how many points each chain plots per dispatch — raise it to resolve detail faster on a strong GPU, lower it to keep the camera responsive on slower hardware. Found in the sidebar’s Render settings.',
      beforeShow: openSidebarScrollTo('pointBatch-slider'),
    },
  ],
}
