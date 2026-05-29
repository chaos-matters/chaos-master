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
      target: '[data-tour-target="canvas"]',
      title: 'The Canvas',
      description:
        'Your fractal flame renders here with WebGPU. Use the mouse wheel to zoom and drag to pan around the flame.',
    },
    {
      target: '[data-tour-target="view-controls"]',
      title: 'View Controls',
      description:
        'Fine-tune resolution, zoom level, and camera position. Undo/redo buttons let you revert accidental changes.',
    },
    {
      target: '[data-tour-target="load-flame"]',
      title: 'Load a Flame',
      description:
        'Open the flame browser to pick from curated examples, recently viewed flames, or load a PNG or flame file from disk.',
    },
    {
      target: '[data-tour-target="canvas"]',
      title: 'Drag and Drop',
      description:
        'You can also drag and drop an exported PNG onto the canvas to load a flame directly, including any embedded animation data.',
    },
    {
      target: '[data-tour-target="save-for-later"]',
      title: 'Save for Later',
      description:
        'Bookmark the current flame to your recent list. Find it again from the welcome screen or the Load Flame browser.',
    },
    {
      target: '[data-tour-target="export-png"]',
      title: 'Export PNG',
      description:
        'Save your flame as a high-resolution PNG. Set dimensions, quality, and optionally embed flame data so others can load it.',
    },
    {
      target: '[data-tour-target="quick-export"]',
      title: 'Quick Export',
      description:
        'Instantly render and download your flame at a preset resolution without opening the export dialog.',
    },
    {
      target: '[data-tour-target="share-link"]',
      title: 'Share Link',
      description:
        'Generate a shareable URL that encodes your flame and optional animation data. Anyone with the link can load and play it.',
    },
    {
      target: '[data-tour-target="logo-favicon"]',
      title: 'Logo / Favicon Export',
      description:
        'Open the logo/favicon generator, which allows you to perfectly crop and export a tiny version of your flame optimized for use as a logo or website favicon.',
    },
    {
      target: '[data-tour-target="randomize-colors"]',
      title: 'Randomize Colors',
      description:
        'Breathe new life into your fractal by quickly cycling through different color palettes and gradients.',
    },
    {
      target: '[data-tour-target="animation-toggle"]',
      title: 'Play / Pause Animation',
      description:
        'Enable animation mode to bring your fractal to life. Click again to pause, or cycle through to disable animation mode entirely.',
    },
    {
      target: '[data-tour-target="show-timeline"]',
      title: 'Timeline Editor',
      description:
        'Open the timeline editor at the bottom of the screen to smoothly keyframe transforms and colors over time.',
    },
    {
      target: '[data-tour-target="adaptive-filter"]',
      title: 'Adaptive Filter',
      description:
        'Toggle the adaptive blur filter. When enabled, it dynamically smooths out noise in low-density areas of the flame.',
    },
    {
      target: '[data-tour-target="quality-presets"]',
      title: 'Quality Presets',
      description:
        'Quickly switch rendering quality limits. Higher quality resolves more detail and reduces noise, but takes longer to compute.',
    },
  ],
}
