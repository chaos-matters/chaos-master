import { applyColorMapToFlame } from '@/flame/colorMap'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { tryValidateTransformColorSnapshot } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../../registry'
import { num, str } from '../describeArgs'
import { isPlainRecord, tryValidatePalette } from './helpers'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

registerCommand({
  id: 'flame.setSkipIters',
  describe: ([iters]) => {
    const n = num(iters, 0)
    return n === undefined
      ? 'Set the skipped iterations'
      : `Skipped iterations: ${n}`
  },
  label: 'Set Skip Iters',
  description: 'Set the number of initial skip iterations',
  shortcut: 'Shift+I',
  execute(ctx, iters?: unknown) {
    const value = typeof iters === 'number' ? iters : 1
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.skipIters = value
    })
  },
})

registerCommand({
  id: 'flame.updateRenderSettings',
  label: 'Update Render Settings',
  description: 'Merge a partial render-settings object into the flame',
  coalesceKey: ([settings, origin]) =>
    isPlainRecord(settings)
      ? `${typeof origin === 'string' ? origin : 'legacy'}:${Object.keys(settings).sort().join(',')}`
      : undefined,
  execute(ctx, settings?: unknown) {
    if (settings === null || typeof settings !== 'object') {
      throw new Error('[cmd] flame.updateRenderSettings: not an object')
    }
    const patch = deepClone(settings) as Record<string, unknown>
    const candidate = deepClone(ctx.flameDescriptor())
    const currentSettings = (candidate.renderSettings ?? {}) as Record<
      string,
      unknown
    >
    const mergedSettings: Record<string, unknown> = {
      ...currentSettings,
      ...patch,
    }
    if (patch.camera && typeof patch.camera === 'object') {
      mergedSettings.camera = {
        ...(currentSettings.camera ?? {}),
        ...(patch.camera as Record<string, unknown>),
      }
    }
    if (patch.camera3D && typeof patch.camera3D === 'object') {
      mergedSettings.camera3D = {
        ...(currentSettings.camera3D ?? {}),
        ...(patch.camera3D as Record<string, unknown>),
      }
    }
    candidate.renderSettings =
      mergedSettings as unknown as FlameDescriptor['renderSettings']
    const validated = tryValidateFlame(candidate)
    if (!validated) {
      console.warn(
        '[cmd] flame.updateRenderSettings: invalid render settings',
        settings,
      )
      return
    }
    if (
      patch.camera ||
      patch.camera3D ||
      currentSettings.dimensions === 3 ||
      patch.dimensions === 3
    ) {
      ctx.timeline.setPreviewHeld?.(false)
    }
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings = deepClone(validated.renderSettings)
    }, 'Render Settings')
  },
})

registerCommand({
  id: 'flame.setExposure',
  describe: ([value]) => {
    const n = num(value, 3)
    return n === undefined ? 'Set the exposure' : `Exposure: ${n}`
  },
  label: 'Set Exposure',
  description: 'Set the flame exposure value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 0.25
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.exposure = v
    })
  },
})

registerCommand({
  id: 'flame.setVibrancy',
  describe: ([value]) => {
    const n = num(value, 3)
    return n === undefined ? 'Set the vibrancy' : `Vibrancy: ${n}`
  },
  label: 'Set Vibrancy',
  description: 'Set the flame vibrancy value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 0.5
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.vibrancy = v
    })
  },
})

registerCommand({
  id: 'flame.setGamma',
  describe: ([value]) => {
    const n = num(value, 3)
    return n === undefined ? 'Set the gamma' : `Gamma: ${n}`
  },
  label: 'Set Gamma',
  description: 'Set the flame gamma value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 2.2
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.gamma = v
    })
  },
})

registerCommand({
  id: 'flame.setContrast',
  describe: ([value]) => {
    const n = num(value, 3)
    return n === undefined ? 'Set the contrast' : `Contrast: ${n}`
  },
  label: 'Set Contrast',
  description: 'Set the flame contrast value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 1
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.contrast = v
    })
  },
})

registerCommand({
  id: 'flame.setBackgroundColor',
  describe: ([r, g, b]) => {
    const to255 = (c: unknown) =>
      typeof c === 'number' ? Math.round(Math.min(1, Math.max(0, c)) * 255) : 0
    return `Background: rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`
  },
  label: 'Set Background Color',
  description: 'Set the background color (RGB, values 0-1)',
  execute(ctx, r?: unknown, g?: unknown, b?: unknown) {
    const cr = typeof r === 'number' ? r : 0
    const cg = typeof g === 'number' ? g : 0
    const cb = typeof b === 'number' ? b : 0
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.backgroundColor = [cr, cg, cb]
    })
  },
})

registerCommand({
  id: 'flame.setDrawMode',
  describe: ([mode]) => `Draw mode: ${mode === 'paint' ? 'paint' : 'light'}`,
  label: 'Set Draw Mode',
  description: 'Set the render draw mode (light or paint)',
  execute(ctx, mode?: unknown) {
    const m = typeof mode === 'string' && mode === 'paint' ? 'paint' : 'light'
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.drawMode = m
    })
  },
})

registerCommand({
  id: 'flame.applyPalette',
  describe: ([palette]) => {
    const name =
      palette !== null && typeof palette === 'object' && 'name' in palette
        ? str((palette as { name?: unknown }).name)
        : undefined
    return name === undefined ? 'Apply a palette' : `Apply palette: ${name}`
  },
  label: 'Apply Palette',
  description:
    'Recolour every transform from a palette and record the palette itself',
  validateReplayArgs(args) {
    return args.length === 1 && tryValidatePalette(args[0])
      ? undefined
      : 'apply palette expects one bounded palette'
  },
  execute(ctx, palette?: unknown) {
    const next = tryValidatePalette(palette)
    if (!next) {
      console.warn('[cmd] flame.applyPalette: not a palette', palette)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      applyColorMapToFlame(draft, {
        id: next.id,
        name: next.name,
        entries: next.entries.map((entry) => ({ a: entry.a, b: entry.b })),
      })
      draft.renderSettings.palette = {
        id: next.id,
        name: next.name,
        entries: next.entries.map(({ id, position, a, b }) => ({
          id,
          position,
          a,
          b,
        })),
      }
    }, 'Apply Palette')
  },
})

registerCommand({
  id: 'flame.removePalette',
  describe: () => 'Remove the palette',
  label: 'Remove Palette',
  description:
    'Drop the palette, restoring the colours transforms had before it',
  validateReplayArgs(args) {
    return args.length === 1 && tryValidateTransformColorSnapshot(args[0])
      ? undefined
      : 'remove palette expects one bounded transform-colour snapshot'
  },
  execute(ctx, restoreColors?: unknown) {
    const saved = tryValidateTransformColorSnapshot(restoreColors)
    if (!saved) {
      console.warn('[cmd] flame.removePalette: invalid restore colours')
      return
    }
    ctx.setFlameDescriptor((draft) => {
      for (const [tid, transform] of Object.entries(draft.transforms)) {
        const color = saved[tid]
        if (color && Number.isFinite(color.x) && Number.isFinite(color.y)) {
          transform.color = { x: color.x, y: color.y }
        }
      }
      delete draft.renderSettings.palette
    }, 'Remove Palette')
  },
})
