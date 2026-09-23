import { DEFAULT_BLEND_WEIGHT } from '@/flame/blend'
import { examples } from '@/flame/examples'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { tryValidateTransformColorSnapshot } from '@/recorder/schema'
import { snapshotOriginForCommand, snapshotOriginLabel, tryValidateSnapshotOrigin, } from '@/recorder/snapshotOrigin'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../../registry'
import { isAbsentRef, isPlainRecord } from './helpers'

registerCommand({
  id: 'flame.loadPreset',
  label: 'Load Preset',
  description: 'Load an example flame by its key name',
  execute(ctx, presetName?: unknown) {
    const name = typeof presetName === 'string' ? presetName : 'initExample'
    const flame = examples[name as keyof typeof examples]
    if (flame) {
      ctx.setFlameDescriptor(() => deepClone(flame))
    }
  },
})

registerCommand({
  id: 'flame.setBlendWeight',
  label: 'Set Blend Weight',
  description: 'Set the blend weight for crossfading (0-1)',
  coalesceKey: () => 'blendWeight',
  execute(ctx, weight?: unknown) {
    const w = typeof weight === 'number' ? Math.max(0, Math.min(1, weight)) : 0
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.blendWeight = w
    }, 'Blend Weight')
  },
})

/**
 * The partner and, when the caller names one, the weight, as one history
 * entry. A weight the caller names always wins. Without one, a document that
 * already has a weight keeps it, whether or not it had a partner, so a weight
 * set first survives the partner that follows. Only a document with no weight
 * at all gets the default: the weight the gallery previews a partner at, so a
 * take recorded before picks carried their weight replays to what its viewer
 * saw.
 */
registerCommand({
  id: 'flame.setBlendFlame',
  label: 'Set Blend Flame',
  description: `Set or clear the flame being blended with (null clears). An optional second argument sets the weight (0-1); without it, the document keeps the weight it has, and one with no weight yet gets ${DEFAULT_BLEND_WEIGHT}`,
  execute(ctx, flame?: unknown, weight?: unknown) {
    const next = isAbsentRef(flame) ? undefined : tryValidateFlame(flame)
    if (!isAbsentRef(flame) && !next) {
      console.warn('[cmd] flame.setBlendFlame: not a valid flame', flame)
      return
    }
    const named =
      typeof weight === 'number' && Number.isFinite(weight)
        ? Math.max(0, Math.min(1, weight))
        : undefined
    ctx.setFlameDescriptor(
      (draft) => {
        if (next === undefined) delete draft.renderSettings.blendFlame
        else draft.renderSettings.blendFlame = next
        if (named !== undefined) {
          draft.renderSettings.blendWeight = named
        } else if (
          next !== undefined &&
          draft.renderSettings.blendWeight === undefined
        ) {
          draft.renderSettings.blendWeight = DEFAULT_BLEND_WEIGHT
        }
      },
      next ? 'Set Blend Flame' : 'Remove Blend Flame',
    )
  },
})

registerCommand({
  id: 'flame.setupMorph',
  label: 'Morph Setup',
  description:
    'Make this flame the blend partner at full weight, ready for a morph animation',
  execute(ctx, endFlame?: unknown) {
    const next = tryValidateFlame(endFlame)
    if (!next) {
      console.warn('[cmd] flame.setupMorph: not a valid flame', endFlame)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.blendFlame = next
      draft.renderSettings.blendWeight = 1
    }, 'Morph Setup')
  },
})

registerCommand({
  id: 'flame.reset',
  label: 'Reset Flame',
  description: 'Reset flame to default starting state (initExample)',
  execute(ctx) {
    ctx.setFlameDescriptor(() => deepClone(examples.initExample))
  },
})

registerCommand({
  id: 'flame.load',
  label: 'Load Flame',
  description:
    'Replace the whole document — opening a saved flame, an import, a bred child',
  describe: (args) =>
    snapshotOriginLabel(snapshotOriginForCommand('flame.load', args)) ??
    (typeof args[1] === 'string' && args[1] !== '' ? args[1] : undefined),
  validateReplayArgs(args) {
    if (args.length < 1 || args.length > 4) {
      return 'load expects a flame, optional label, palette snapshot, and semantic origin'
    }
    if (!tryValidateFlame(deepClone(args[0]))) {
      return 'flame descriptor is invalid'
    }
    if (
      args[1] !== undefined &&
      (typeof args[1] !== 'string' || args[1].length > 512)
    ) {
      return 'load label must be a short string'
    }
    if (args.length >= 3 && !tryValidateTransformColorSnapshot(args[2])) {
      return 'load palette provenance is invalid'
    }
    if (args.length === 4 && !tryValidateSnapshotOrigin(args[3])) {
      return 'load semantic origin is invalid'
    }
    return undefined
  },
  execute(ctx, descriptor?: unknown, label?: unknown) {
    const flame = tryValidateFlame(deepClone(descriptor))
    if (!flame) {
      console.warn('[cmd] flame.load: not a valid flame', descriptor)
      return
    }
    ctx.setFlameDescriptor(
      () => flame,
      typeof label === 'string' && label !== '' ? label : 'Load Flame',
    )
  },
})

registerCommand({
  id: 'flame.setMetadata',
  label: 'Set Flame Metadata',
  description: 'Set the flame name, author or description',
  coalesceKey: ([field]) =>
    typeof field === 'string' ? `metadata:${field}` : undefined,
  describe: ([field]) =>
    typeof field === 'string' ? `Set flame ${field}` : 'Set flame metadata',
  execute(ctx, field?: unknown, value?: unknown) {
    if (isPlainRecord(field) && value === undefined) {
      const keys = Object.keys(field)
      if (
        keys.length === 0 ||
        !keys.every(
          (key) =>
            (key === 'name' || key === 'author' || key === 'description') &&
            typeof field[key] === 'string' &&
            field[key].length <= 16_384,
        )
      ) {
        console.warn('[cmd] flame.setMetadata: rejected patch', field)
        return
      }
      ctx.setFlameDescriptor((draft) => {
        draft.metadata ??= { name: '', description: '', author: '' }
        for (const key of keys) {
          draft.metadata[key as 'name' | 'author' | 'description'] = field[
            key
          ] as string
        }
      }, 'Flame Metadata')
      return
    }
    if (
      (field !== 'name' && field !== 'author' && field !== 'description') ||
      typeof value !== 'string'
    ) {
      console.warn('[cmd] flame.setMetadata: rejected', field, value)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      draft.metadata ??= { name: '', description: '', author: '' }
      draft.metadata[field] = value
    }, 'Flame Metadata')
  },
})
