import { createSignal, Show } from 'solid-js'
import { random01 } from '@/flame/randomize'
import { recordEntries } from '@/utils/record'
import ui from './AnimationGenerator.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { EasingCurve, TimelineState } from '@/utils/timeline'

/* ──── Module-level randomization ──── */

const EASING_POOL: EasingCurve[] = [
  'easeInOut',
  'easeInOut',
  'easeInOut',
  'linear',
  'linear',
  'easeOut',
  'easeOut',
  'easeIn',
  'bounce',
  'elastic',
]

function randomEasing(): EasingCurve {
  return EASING_POOL[Math.floor(Math.random() * EASING_POOL.length)]!
}

function randomizeParams(
  flame: FlameDescriptor,
  timeline: TimelineState,
  subtle: boolean,
) {
  const pool = buildParamPool(flame)
  if (pool.length === 0) return

  const endFrame = timeline.config().endFrame
  const count = 3 + Math.floor(Math.random() * 6) // 3-8
  const used = new Set<number>()

  for (let i = 0; i < count && i < pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    const entry = pool[idx]!

    let frame: number
    do {
      frame = Math.floor(Math.random() * (endFrame + 1))
    } while (used.has(frame) && used.size < endFrame + 1)
    used.add(frame)

    timeline.addKeyframe(
      entry.path,
      frame,
      randomValueForPath(entry.path, entry.value, subtle),
      randomEasing(),
    )
  }
}

function randomizeColorsParams(
  flame: FlameDescriptor,
  timeline: TimelineState,
  subtle: boolean,
) {
  const endFrame = timeline.config().endFrame
  const transforms = recordEntries(flame.transforms)
  if (transforms.length === 0) return

  const totalSteps = transforms.length * 3 + 6
  const segmentSize = endFrame / totalSteps

  let idx = 0
  for (const [tid, t] of transforms) {
    const tidStr = String(tid)
    const count = 2 + Math.floor(Math.random() * 2)
    for (let k = 0; k < count; k++) {
      const frame = Math.min(
        endFrame,
        Math.round(idx * segmentSize + Math.random() * segmentSize * 2),
      )
      const easing = randomEasing()
      const cx = subtleBlend(t.color.x, random01(), subtle)
      const cy = subtleBlend(t.color.y, random01(), subtle)
      timeline.addKeyframe(`transform.${tidStr}.color.x`, frame, cx, easing)
      timeline.addKeyframe(`transform.${tidStr}.color.y`, frame, cy, easing)
      idx++
    }
  }

  const paletteParams = ['paletteSpeed', 'palettePhase'] as const
  const rs = flame.renderSettings
  for (const param of paletteParams) {
    const current = param === 'paletteSpeed' ? rs.paletteSpeed : rs.palettePhase
    for (let k = 0; k < 3; k++) {
      const frame = Math.min(
        endFrame,
        Math.round(idx * segmentSize + Math.random() * segmentSize * 2),
      )
      timeline.addKeyframe(
        param,
        frame,
        randomValueForPath(param, current, subtle),
        randomEasing(),
      )
      idx++
    }
  }
}

/* ──── AnimationControls (inline buttons for header) ──── */

type AnimationControlsProps = {
  flameDescriptor: FlameDescriptor
  timeline: TimelineState
  presetsExpanded: boolean
  onTogglePresets: () => void
}

export function AnimationControls(props: AnimationControlsProps) {
  const [subtleMode, setSubtleMode] = createSignal(false)

  return (
    <span class={ui.controlsRow}>
      <button
        class={ui.genBtn}
        onClick={() => {
          randomizeParams(props.flameDescriptor, props.timeline, subtleMode())
        }}
        title="Generate random keyframes from current flame parameters"
      >
        Gen
      </button>
      <button
        class={ui.genBtn}
        onClick={() => {
          randomizeColorsParams(
            props.flameDescriptor,
            props.timeline,
            subtleMode(),
          )
        }}
        title="Generate random color keyframes for transforms and palette"
      >
        Colors
      </button>
      <button
        class={ui.genBtn}
        onClick={() => props.timeline.clearAllTracks()}
        title="Clear all keyframes (undoable)"
      >
        Clear
      </button>
      <button
        class={ui.genBtn}
        classList={{ [ui.active as string]: subtleMode() }}
        onClick={() => setSubtleMode(!subtleMode())}
        title={
          subtleMode()
            ? 'Subtle mode on — values stay close to originals'
            : 'Subtle mode off — full randomization'
        }
      >
        Subtle
      </button>
      <button
        class={ui.presetsToggle}
        classList={{
          [ui.presetsToggleActive as string]: props.presetsExpanded,
        }}
        onClick={props.onTogglePresets}
        title="Animation presets"
      >
        Presets
      </button>
    </span>
  )
}

/* ──── AnimationGenerator (presets panel) ──── */

type AnimationGeneratorProps = {
  flameDescriptor: FlameDescriptor
  timeline: TimelineState
  expanded: boolean
}

type PresetDef = {
  label: string
  apply: (flame: FlameDescriptor, timeline: TimelineState) => void
}

export function AnimationGenerator(props: AnimationGeneratorProps) {
  const presets: PresetDef[] = buildPresets()

  return (
    <Show when={props.expanded}>
      <div class={ui.wrapper}>
        <div class={ui.presetsPanel}>
          {presets.map((preset) => (
            <button
              class={ui.pill}
              onClick={() =>
                preset.apply(props.flameDescriptor, props.timeline)
              }
              title={preset.label}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </Show>
  )
}

/* ──── Parameter pool ──── */

function buildParamPool(
  flame: FlameDescriptor,
): { path: string; value: number }[] {
  const pool: { path: string; value: number }[] = []

  const rs = flame.renderSettings
  pool.push({ path: 'exposure', value: rs.exposure })
  pool.push({ path: 'skipIters', value: rs.skipIters })
  pool.push({ path: 'vibrancy', value: rs.vibrancy })
  pool.push({ path: 'contrast', value: rs.contrast })
  pool.push({ path: 'gamma', value: rs.gamma })
  pool.push({ path: 'highlightPower', value: rs.highlightPower })
  pool.push({
    path: 'densityEstimationQuality',
    value: rs.densityEstimationQuality,
  })
  pool.push({ path: 'paletteSpeed', value: rs.paletteSpeed })
  pool.push({ path: 'palettePhase', value: rs.palettePhase })
  if (rs.camera) {
    pool.push({ path: 'camera.x', value: rs.camera.position[0] })
    pool.push({ path: 'camera.y', value: rs.camera.position[1] })
    pool.push({ path: 'camera.zoom', value: rs.camera.zoom })
  }

  for (const [tid, transform] of recordEntries(flame.transforms)) {
    const tidStr = String(tid)
    pool.push({
      path: `transform.${tidStr}.probability`,
      value: transform.probability,
    })

    for (const affine of ['preAffine', 'postAffine'] as const) {
      for (const coeff of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        pool.push({
          path: `transform.${tidStr}.${affine}.${coeff}`,
          value: transform[affine][coeff],
        })
      }
    }

    pool.push({ path: `transform.${tidStr}.color.x`, value: transform.color.x })
    pool.push({ path: `transform.${tidStr}.color.y`, value: transform.color.y })

    for (const [vid, variation] of recordEntries(transform.variations)) {
      const vidStr = String(vid)
      pool.push({ path: `${tidStr}.${vidStr}`, value: variation.weight })
    }
  }

  return pool
}

function subtleBlend(current: number, random: number, subtle: boolean): number {
  if (!subtle) return random
  return current + (random - current) * 0.15
}

function wildValueForPath(path: string): number {
  if (path.endsWith('.probability') || path.includes('.color.')) {
    return random01()
  }
  if (path === 'skipIters') {
    return Math.floor(random01() * 30)
  }
  if (path === 'exposure') {
    return (random01() - 0.5) * 16
  }
  if (path === 'vibrancy') {
    return random01() * 3
  }
  if (path === 'contrast') {
    return 0.01 + random01() * 19.99
  }
  if (path === 'gamma') {
    return 0.1 + random01() * 7.9
  }
  if (path === 'highlightPower') {
    return random01() * 2
  }
  if (path === 'paletteSpeed') {
    return random01() * 30
  }
  if (path === 'palettePhase') {
    return random01()
  }
  if (path.startsWith('camera.')) {
    if (path === 'camera.zoom') return 0.1 + random01() * 5
    return (random01() - 0.5) * 2
  }
  // Affine coefficients: 30% chance of zero-centered [-1,1], 70% [0,1]
  if (random01() < 0.3) return (random01() - 0.5) * 2
  return random01()
}

function randomValueForPath(
  path: string,
  current: number,
  subtle: boolean,
): number {
  return subtleBlend(current, wildValueForPath(path), subtle)
}

/* ──── Presets ──── */

function frameRange(timeline: TimelineState): {
  start: number
  mid: number
  end: number
} {
  const cfg = timeline.config()
  const end = cfg.endFrame
  return { start: 0, mid: Math.round(end / 2), end }
}

const EASE_IN_OUT: EasingCurve = 'easeInOut'
const EASE_OUT: EasingCurve = 'easeOut'
const LINEAR: EasingCurve = 'linear'

function buildPresets(): PresetDef[] {
  return [
    ...cameraPresets(),
    ...renderPresets(),
    ...colorPresets(),
    ...affinePresets(),
  ]
}

function cameraPresets(): PresetDef[] {
  return [
    {
      label: 'Zoom In',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.zoom', start, cam.zoom, EASE_IN_OUT)
        timeline.addKeyframe('camera.zoom', end, cam.zoom * 2.5, EASE_IN_OUT)
      },
    },
    {
      label: 'Zoom Out',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.zoom', start, cam.zoom, EASE_IN_OUT)
        timeline.addKeyframe('camera.zoom', end, cam.zoom * 0.4, EASE_IN_OUT)
      },
    },
    {
      label: 'Pan Left',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.x', start, cam.position[0], EASE_IN_OUT)
        timeline.addKeyframe(
          'camera.x',
          end,
          cam.position[0] - 0.5,
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Pan Right',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.x', start, cam.position[0], EASE_IN_OUT)
        timeline.addKeyframe(
          'camera.x',
          end,
          cam.position[0] + 0.5,
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Pan Up',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.y', start, cam.position[1], EASE_IN_OUT)
        timeline.addKeyframe(
          'camera.y',
          end,
          cam.position[1] + 0.5,
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Pan Down',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.y', start, cam.position[1], EASE_IN_OUT)
        timeline.addKeyframe(
          'camera.y',
          end,
          cam.position[1] - 0.5,
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Swipe LR',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, mid, end } = frameRange(timeline)
        timeline.addKeyframe(
          'camera.x',
          start,
          cam.position[0] - 0.3,
          EASE_IN_OUT,
        )
        timeline.addKeyframe('camera.y', start, cam.position[1], EASE_IN_OUT)
        timeline.addKeyframe(
          'camera.x',
          mid,
          cam.position[0] + 0.3,
          EASE_IN_OUT,
        )
        timeline.addKeyframe(
          'camera.x',
          end,
          cam.position[0] - 0.3,
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Swipe UD',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, mid, end } = frameRange(timeline)
        timeline.addKeyframe(
          'camera.y',
          start,
          cam.position[1] - 0.3,
          EASE_IN_OUT,
        )
        timeline.addKeyframe('camera.x', start, cam.position[0], EASE_IN_OUT)
        timeline.addKeyframe(
          'camera.y',
          mid,
          cam.position[1] + 0.3,
          EASE_IN_OUT,
        )
        timeline.addKeyframe(
          'camera.y',
          end,
          cam.position[1] - 0.3,
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Reveal',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.zoom', start, cam.zoom * 5, EASE_OUT)
        timeline.addKeyframe('camera.x', start, cam.position[0] + 0.2, EASE_OUT)
        timeline.addKeyframe('camera.y', start, cam.position[1] - 0.1, EASE_OUT)
        timeline.addKeyframe('camera.zoom', end, cam.zoom, EASE_OUT)
        timeline.addKeyframe('camera.x', end, cam.position[0], EASE_OUT)
        timeline.addKeyframe('camera.y', end, cam.position[1], EASE_OUT)
      },
    },
    {
      label: 'Implode',
      apply(flame, timeline) {
        const cam = flame.renderSettings.camera
        if (!cam) return
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('camera.zoom', start, cam.zoom, EASE_IN_OUT)
        timeline.addKeyframe('camera.x', start, cam.position[0], EASE_IN_OUT)
        timeline.addKeyframe('camera.y', start, cam.position[1], EASE_IN_OUT)
        timeline.addKeyframe('camera.zoom', end, cam.zoom * 0.15, EASE_IN_OUT)
        timeline.addKeyframe(
          'camera.x',
          end,
          cam.position[0] + 0.1,
          EASE_IN_OUT,
        )
        timeline.addKeyframe(
          'camera.y',
          end,
          cam.position[1] - 0.1,
          EASE_IN_OUT,
        )
      },
    },
  ]
}

function renderPresets(): PresetDef[] {
  return [
    {
      label: 'Skip 1→15',
      apply(_flame, timeline) {
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('skipIters', start, 1, LINEAR)
        timeline.addKeyframe('skipIters', end, 15, LINEAR)
      },
    },
    {
      label: 'Skip 15→1',
      apply(_flame, timeline) {
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('skipIters', start, 15, LINEAR)
        timeline.addKeyframe('skipIters', end, 1, LINEAR)
      },
    },
    {
      label: 'Contrast ↑',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const v = flame.renderSettings.contrast
        timeline.addKeyframe('contrast', start, v, EASE_IN_OUT)
        timeline.addKeyframe('contrast', end, Math.min(20, v * 3), EASE_IN_OUT)
      },
    },
    {
      label: 'Contrast ↓',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const v = flame.renderSettings.contrast
        timeline.addKeyframe('contrast', start, v, EASE_IN_OUT)
        timeline.addKeyframe(
          'contrast',
          end,
          Math.max(0.01, v * 0.3),
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Gamma ↑',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const v = flame.renderSettings.gamma
        timeline.addKeyframe('gamma', start, v, EASE_IN_OUT)
        timeline.addKeyframe('gamma', end, Math.min(8, v * 2), EASE_IN_OUT)
      },
    },
    {
      label: 'Gamma ↓',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const v = flame.renderSettings.gamma
        timeline.addKeyframe('gamma', start, v, EASE_IN_OUT)
        timeline.addKeyframe('gamma', end, Math.max(0.1, v * 0.5), EASE_IN_OUT)
      },
    },
    {
      label: 'Expo Flash',
      apply(flame, timeline) {
        const { start, mid, end } = frameRange(timeline)
        const v = flame.renderSettings.exposure
        timeline.addKeyframe('exposure', start, v, EASE_OUT)
        timeline.addKeyframe('exposure', mid, v + 3, EASE_OUT)
        timeline.addKeyframe('exposure', end, v, EASE_OUT)
      },
    },
    {
      label: 'Vibrancy ↑',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const v = flame.renderSettings.vibrancy
        timeline.addKeyframe('vibrancy', start, v, EASE_IN_OUT)
        timeline.addKeyframe('vibrancy', end, Math.min(3, v * 2), EASE_IN_OUT)
      },
    },
    {
      label: 'Vibrancy ↓',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const v = flame.renderSettings.vibrancy
        timeline.addKeyframe('vibrancy', start, v, EASE_IN_OUT)
        timeline.addKeyframe('vibrancy', end, Math.max(0, v * 0.3), EASE_IN_OUT)
      },
    },
    {
      label: 'Phase 0→1',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        timeline.addKeyframe('palettePhase', start, 0, LINEAR)
        timeline.addKeyframe('palettePhase', end, 1, LINEAR)
      },
    },
  ]
}

function colorPresets(): PresetDef[] {
  return [
    {
      label: 'Colors Shift',
      apply(flame, timeline) {
        const { start, mid, end } = frameRange(timeline)
        for (const [tid, t] of recordEntries(flame.transforms)) {
          const tidStr = String(tid)
          timeline.addKeyframe(
            `transform.${tidStr}.color.x`,
            start,
            t.color.x,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.y`,
            start,
            t.color.y,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.x`,
            mid,
            random01(),
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.y`,
            mid,
            random01(),
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.x`,
            end,
            random01(),
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.y`,
            end,
            random01(),
            EASE_IN_OUT,
          )
        }
      },
    },
    {
      label: 'Colors Swap',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        for (const [tid, t] of recordEntries(flame.transforms)) {
          const tidStr = String(tid)
          timeline.addKeyframe(
            `transform.${tidStr}.color.x`,
            start,
            t.color.x,
            LINEAR,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.y`,
            start,
            t.color.y,
            LINEAR,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.x`,
            end,
            1 - t.color.y,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.color.y`,
            end,
            1 - t.color.x,
            EASE_IN_OUT,
          )
        }
      },
    },
    {
      label: 'Speed Up',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const v = flame.renderSettings.paletteSpeed
        timeline.addKeyframe('paletteSpeed', start, v, EASE_IN_OUT)
        timeline.addKeyframe(
          'paletteSpeed',
          end,
          Math.min(30, v * 2),
          EASE_IN_OUT,
        )
      },
    },
    {
      label: 'Speed Wave',
      apply(flame, timeline) {
        const { start, mid, end } = frameRange(timeline)
        const v = flame.renderSettings.paletteSpeed
        const peak = Math.min(30, Math.max(v, 3))
        timeline.addKeyframe('paletteSpeed', start, v, EASE_IN_OUT)
        timeline.addKeyframe('paletteSpeed', mid, peak, EASE_IN_OUT)
        timeline.addKeyframe('paletteSpeed', end, v, EASE_IN_OUT)
      },
    },
    {
      label: 'Phase Cycle',
      apply(flame, timeline) {
        const { start, mid, end } = frameRange(timeline)
        const v = flame.renderSettings.palettePhase
        timeline.addKeyframe('palettePhase', start, v, EASE_IN_OUT)
        timeline.addKeyframe('palettePhase', mid, (v + 0.5) % 1, EASE_IN_OUT)
        timeline.addKeyframe('palettePhase', end, v, EASE_IN_OUT)
      },
    },
  ]
}

function affinePresets(): PresetDef[] {
  return [
    {
      label: 'Scale Up',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        for (const [tid, t] of recordEntries(flame.transforms)) {
          const tidStr = String(tid)
          const aff = t.postAffine
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.a`,
            start,
            aff.a,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.d`,
            start,
            aff.d,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.a`,
            end,
            aff.a * 1.5,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.d`,
            end,
            aff.d * 1.5,
            EASE_IN_OUT,
          )
        }
      },
    },
    {
      label: 'Scale Down',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        for (const [tid, t] of recordEntries(flame.transforms)) {
          const tidStr = String(tid)
          const aff = t.postAffine
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.a`,
            start,
            aff.a,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.d`,
            start,
            aff.d,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.a`,
            end,
            aff.a * 0.5,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.d`,
            end,
            aff.d * 0.5,
            EASE_IN_OUT,
          )
        }
      },
    },
    {
      label: 'Rotate 90°',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        for (const [tid, t] of recordEntries(flame.transforms)) {
          const tidStr = String(tid)
          const { a, b, c, d } = t.postAffine
          // Post-multiply by 90° rotation: [a b; c d] * [0 -1; 1 0] = [b -a; d -c]
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.a`,
            start,
            a,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.b`,
            start,
            b,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.c`,
            start,
            c,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.d`,
            start,
            d,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.a`,
            end,
            b,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.b`,
            end,
            -a,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.c`,
            end,
            d,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.d`,
            end,
            -c,
            EASE_IN_OUT,
          )
        }
      },
    },
    {
      label: 'Prob Shift',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        const entries = recordEntries(flame.transforms)
        const total = entries.reduce((s, [, t]) => s + t.probability, 0)
        // Generate random shares, then normalize so they sum to total
        const rawValues = entries.map(() => random01())
        const rawSum = rawValues.reduce((s, v) => s + v, 0)
        for (let i = 0; i < entries.length; i++) {
          const [tid, t] = entries[i]!
          const tidStr = String(tid)
          timeline.addKeyframe(
            `transform.${tidStr}.probability`,
            start,
            t.probability,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.probability`,
            end,
            (rawValues[i]! / rawSum) * total,
            EASE_IN_OUT,
          )
        }
      },
    },
    {
      label: 'Wiggle',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        for (const [tid, t] of recordEntries(flame.transforms)) {
          const tidStr = String(tid)
          for (const affine of ['preAffine', 'postAffine'] as const) {
            for (const coeff of ['a', 'b', 'c', 'd'] as const) {
              const v = t[affine][coeff]
              timeline.addKeyframe(
                `transform.${tidStr}.${affine}.${coeff}`,
                start,
                v,
                EASE_IN_OUT,
              )
              timeline.addKeyframe(
                `transform.${tidStr}.${affine}.${coeff}`,
                end,
                v + (random01() - 0.5) * 0.3,
                EASE_IN_OUT,
              )
            }
          }
        }
      },
    },
    {
      label: 'Drift',
      apply(flame, timeline) {
        const { start, end } = frameRange(timeline)
        for (const [tid, t] of recordEntries(flame.transforms)) {
          const tidStr = String(tid)
          const aff = t.postAffine
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.e`,
            start,
            aff.e,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.f`,
            start,
            aff.f,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.e`,
            end,
            aff.e + (random01() - 0.5) * 0.6,
            EASE_IN_OUT,
          )
          timeline.addKeyframe(
            `transform.${tidStr}.postAffine.f`,
            end,
            aff.f + (random01() - 0.5) * 0.6,
            EASE_IN_OUT,
          )
        }
      },
    },
  ]
}
