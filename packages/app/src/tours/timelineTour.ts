import { openSidebar, openTimeline, tourTarget } from './stepFactory'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'

export const timelineTour: TourGuide = {
  id: 'timeline',
  name: 'Timeline Tour',
  description:
    'Learn the dope sheet — playback, keyframe editing, auto mode, and sharing your animations.',
  nextTourId: 'app',
  nextTourLabel: 'App Tour',
  steps: [
    {
      target: tourTarget('timeline-section'),
      title: 'The Dope Sheet',
      description:
        'The timeline shows all animation tracks as a dope sheet. Drag the resize handle above to expand or collapse it. Use the Play/Pause button in the transport bar to preview the animation.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('load-flame'),
      title: 'Load Animation',
      description:
        'Click Load Flame and scroll down to find Animation Examples. Each one plays a preview on hover so you can see the animation before loading it.',
    },
    {
      target: tourTarget('play-button'),
      title: 'Play Animation',
      description:
        'Click Play to run the animation. Frames interpolate smoothly between keyframes at the FPS you set. The playhead moves across the dope sheet in real time.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('dope-sheet'),
      title: 'Keyframe Diamonds',
      description:
        'Each diamond on the dope sheet is a keyframe at that frame number. Click a diamond to inspect its value and easing curve in the inspector.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('seek-ruler'),
      title: 'Seek & Scrub',
      description:
        'Click or drag on the frame ruler at the top of the dope sheet to jump to any frame instantly. The red playhead shows your current position.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('dope-sheet'),
      title: 'Drag Keyframes',
      description:
        'Drag a diamond left or right to change which frame the keyframe fires on. The animation updates in real time as you drag.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('dope-sheet'),
      title: 'Context Menu',
      description:
        'Right-click any diamond to open a context menu. From there you can insert or remove keyframes, remove all keyframes on a track, or change the easing curve type.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('auto-keyframe'),
      title: 'Auto Mode',
      description:
        'When Auto is ON, adjusting any property that already has keyframes automatically creates a new keyframe at the current frame. Think of it like recording mode.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('sidebar'),
      title: 'Manual Keyframes',
      description:
        'Click the diamond icons next to sliders in the sidebar to insert keyframes at the current frame. This gives you precise control over which values to animate.',
      beforeShow: openSidebar,
    },
    {
      target: tourTarget('del-mode'),
      title: 'Delete Keyframes',
      description:
        'Toggle Del mode to enter delete mode — then click any diamond on the dope sheet to remove it. You can also right-click a diamond and choose Remove Keyframe.',
      beforeShow: openTimeline,
    },
    {
      target: tourTarget('share-link'),
      title: 'Share Your Animation',
      description:
        'Export PNG and Share Link both support embedding animation data. Recipients can load your flame and play your animation exactly as you created it.',
    },
  ],
}
