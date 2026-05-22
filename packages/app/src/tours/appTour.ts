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
      target: '[data-tour-target="share-link"]',
      title: 'Share Link',
      description:
        'Generate a shareable URL that encodes your flame and optional animation data. Anyone with the link can load and play it.',
    },
  ],
}
