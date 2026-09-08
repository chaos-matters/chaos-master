import { executeCommand } from '@/commands/registry'
import { smartRandomAnimation } from '@/components/Timeline/presets'
import { randomRange } from '@/flame/randomize'
import { snapshotOrigin } from '@/recorder/snapshotOrigin'
import { runTimelineSnapshotMutation } from '@/recorder/timelineActions'
import type { Setter } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { EasingCurve, TimelineState } from '@/utils/timeline'

export interface UseWorkspaceAnimationGenParams {
  timeline: TimelineState
  flameDescriptor: FlameDescriptor
  getCmdContext: () => CommandContext
  setAnimationEnabled: Setter<boolean>
  setIsRandomizingAnimation: (val: boolean) => void
}

interface FrameBounds {
  start: number
  mid: number
  end: number
}

function addLoopingTrack(
  timeline: TimelineState,
  bounds: FrameBounds,
  paramPath: string,
  startVal: number,
  minPerturb: number,
  maxPerturb: number,
  easing: EasingCurve = 'easeInOut',
) {
  const perturb =
    randomRange(minPerturb, maxPerturb) * (Math.random() > 0.5 ? 1 : -1)
  const midVal = startVal + perturb
  timeline.addKeyframe(paramPath, bounds.start, startVal, easing)
  timeline.addKeyframe(paramPath, bounds.mid, midVal, easing)
  timeline.addKeyframe(paramPath, bounds.end, startVal, easing)
}

function addContinuousTrack(
  timeline: TimelineState,
  bounds: FrameBounds,
  paramPath: string,
  startVal: number,
  delta: number,
) {
  timeline.addKeyframe(paramPath, bounds.start, startVal, 'linear')
  timeline.addKeyframe(paramPath, bounds.end, startVal + delta, 'linear')
}

const PRESET_APPLIERS: Record<
  string,
  (timeline: TimelineState, flame: FlameDescriptor, bounds: FrameBounds) => void
> = {
  pan: (timeline, flame, bounds) => {
    const camX = flame.renderSettings.camera?.position?.[0] ?? 0
    const camY = flame.renderSettings.camera?.position?.[1] ?? 0
    addLoopingTrack(timeline, bounds, 'camera.x', camX, 0.1, 0.4)
    addLoopingTrack(timeline, bounds, 'camera.y', camY, 0.1, 0.4)
  },
  zoom: (timeline, flame, bounds) => {
    const zoom = flame.renderSettings.camera?.zoom ?? 1
    addLoopingTrack(
      timeline,
      bounds,
      'camera.zoom',
      zoom,
      zoom * 0.15,
      zoom * 0.4,
    )
  },
  rot: (timeline, flame, bounds) => {
    const rot = flame.renderSettings.camera?.rotation ?? 0
    const dir = Math.random() > 0.5 ? 1 : -1
    addContinuousTrack(
      timeline,
      bounds,
      'camera.rotation',
      rot,
      dir * 2 * Math.PI,
    )
  },
  color: (timeline, flame, bounds) => {
    const phase = flame.renderSettings.palettePhase ?? 0
    const dir = Math.random() > 0.5 ? 1 : -1
    addContinuousTrack(
      timeline,
      bounds,
      'palettePhase',
      phase,
      dir * randomRange(1, 3),
    )
  },
  transformColor: (timeline, flame, bounds) => {
    for (const [tid, t] of Object.entries(flame.transforms)) {
      addLoopingTrack(
        timeline,
        bounds,
        `transform.${tid}.color.x`,
        t.color?.x ?? 0,
        0.1,
        0.3,
      )
      addLoopingTrack(
        timeline,
        bounds,
        `transform.${tid}.color.y`,
        t.color?.y ?? 0,
        0.1,
        0.3,
      )
    }
  },
  vibrancy: (timeline, flame, bounds) => {
    const vib = flame.renderSettings.vibrancy ?? 0.5
    const minPert = vib > 0.5 ? -0.3 : 0.1
    const maxPert = vib > 0.5 ? -0.1 : 0.3
    addLoopingTrack(timeline, bounds, 'vibrancy', vib, minPert, maxPert)
  },
  orbit: (timeline, flame, bounds) => {
    const theta = flame.renderSettings.camera3D?.theta ?? 0
    const phi = flame.renderSettings.camera3D?.phi ?? Math.PI / 2
    const radius = flame.renderSettings.camera3D?.radius ?? 5

    addContinuousTrack(timeline, bounds, 'camera3D.theta', theta, 2 * Math.PI)
    addLoopingTrack(timeline, bounds, 'camera3D.phi', phi, 0.1, 0.3)
    addLoopingTrack(
      timeline,
      bounds,
      'camera3D.radius',
      radius,
      radius * 0.1,
      radius * 0.25,
    )
  },
  finalTransform: (timeline, _flame, bounds) => {
    const { start, mid, end } = bounds
    const q1 = Math.floor(start + (end - start) * 0.25)
    const q3 = Math.floor(start + (end - start) * 0.75)
    const dir = Math.random() > 0.5 ? 1 : -1

    timeline.addKeyframe('finalTransform.a', start, 1, 'linear')
    timeline.addKeyframe('finalTransform.a', q1, 0, 'linear')
    timeline.addKeyframe('finalTransform.a', mid, -1, 'linear')
    timeline.addKeyframe('finalTransform.a', q3, 0, 'linear')
    timeline.addKeyframe('finalTransform.a', end, 1, 'linear')

    timeline.addKeyframe('finalTransform.e', start, 1, 'linear')
    timeline.addKeyframe('finalTransform.e', q1, 0, 'linear')
    timeline.addKeyframe('finalTransform.e', mid, -1, 'linear')
    timeline.addKeyframe('finalTransform.e', q3, 0, 'linear')
    timeline.addKeyframe('finalTransform.e', end, 1, 'linear')

    timeline.addKeyframe('finalTransform.b', start, 0, 'linear')
    timeline.addKeyframe('finalTransform.b', q1, -dir, 'linear')
    timeline.addKeyframe('finalTransform.b', mid, 0, 'linear')
    timeline.addKeyframe('finalTransform.b', q3, dir, 'linear')
    timeline.addKeyframe('finalTransform.b', end, 0, 'linear')

    timeline.addKeyframe('finalTransform.d', start, 0, 'linear')
    timeline.addKeyframe('finalTransform.d', q1, dir, 'linear')
    timeline.addKeyframe('finalTransform.d', mid, 0, 'linear')
    timeline.addKeyframe('finalTransform.d', q3, -dir, 'linear')
    timeline.addKeyframe('finalTransform.d', end, 0, 'linear')
  },
}

function randomizeAnimationTracks(
  timeline: TimelineState,
  flame: FlameDescriptor,
  presetIds: string[],
  clearFirst: boolean,
  setAnimationEnabled: Setter<boolean>,
) {
  if (clearFirst) timeline.clearAllTracks()

  const start = timeline.config().startFrame
  const end = timeline.config().endFrame
  const bounds: FrameBounds = {
    start,
    mid: Math.floor((start + end) / 2),
    end,
  }

  for (const preset of presetIds) {
    const applier = PRESET_APPLIERS[preset]
    if (applier) {
      applier(timeline, flame, bounds)
    }
  }

  timeline.setAnimationEnabled(true)
  setAnimationEnabled(true)
}

export function useWorkspaceAnimationGen(
  params: UseWorkspaceAnimationGenParams,
) {
  const {
    timeline,
    flameDescriptor,
    getCmdContext,
    setAnimationEnabled,
    setIsRandomizingAnimation,
  } = params

  const handleRandomizeAnimation = (
    presetIds: string[],
    clearFirst: boolean,
  ) => {
    if (presetIds.length === 0) return

    setIsRandomizingAnimation(true)
    try {
      runTimelineSnapshotMutation(
        timeline,
        snapshotOrigin('timeline.random', presetIds.join(', ')),
        () => {
          randomizeAnimationTracks(
            timeline,
            flameDescriptor,
            presetIds,
            clearFirst,
            setAnimationEnabled,
          )
        },
      )
      executeCommand('view.setShowTimeline', getCmdContext(), true)
    } finally {
      setTimeout(() => {
        setIsRandomizingAnimation(false)
      }, 200)
    }
  }

  const handleSmartAnimation = (clearFirst: boolean) => {
    setIsRandomizingAnimation(true)
    try {
      runTimelineSnapshotMutation(
        timeline,
        snapshotOrigin('timeline.smart'),
        () => {
          if (clearFirst) timeline.clearAllTracks()
          smartRandomAnimation(flameDescriptor, timeline)
          timeline.setAnimationEnabled(true)
          setAnimationEnabled(true)
        },
      )
      executeCommand('view.setShowTimeline', getCmdContext(), true)
    } finally {
      setTimeout(() => {
        setIsRandomizingAnimation(false)
      }, 200)
    }
  }

  return {
    handleRandomizeAnimation,
    handleSmartAnimation,
  }
}
