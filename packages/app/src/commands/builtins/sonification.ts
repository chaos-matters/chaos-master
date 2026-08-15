import { applySonificationSnapshot, tryValidateSonificationConfig, tryValidateSonificationSnapshot, } from '@/recorder/sonificationState'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'
import type { CommandContext } from '../types'
import type { SonificationSnapshot } from '@/recorder/sonificationState'
import type { SonificationConfig } from '@/utils/sonification'

type SonificationConfigKey = keyof SonificationConfig

const CONFIG_KEYS = new Set<SonificationConfigKey>([
  'model',
  'volume',
  'updateRate',
  'scale',
  'voiceCount',
  'harmonicDensity',
  'triggerRate',
  'spatialSpread',
  'reverbMix',
])

const CONTINUOUS_CONFIG_KEYS = new Set<SonificationConfigKey>([
  'volume',
  'updateRate',
  'voiceCount',
  'harmonicDensity',
  'triggerRate',
  'spatialSpread',
  'reverbMix',
])

function isConfigKey(value: unknown): value is SonificationConfigKey {
  return (
    typeof value === 'string' && CONFIG_KEYS.has(value as SonificationConfigKey)
  )
}

function snapshotWith(
  ctx: CommandContext,
  patch: Partial<SonificationSnapshot>,
): SonificationSnapshot | undefined {
  const current = ctx.sonification?.snapshot()
  if (!current) return undefined
  return tryValidateSonificationSnapshot({
    ...deepClone(current),
    ...deepClone(patch),
  })
}

function applySnapshot(ctx: CommandContext, value: unknown): boolean {
  const snapshot = tryValidateSonificationSnapshot(value)
  const target = ctx.sonification
  if (!snapshot || !target) return false
  applySonificationSnapshot(snapshot, target)
  return true
}

function describeConfig(snapshot: SonificationSnapshot, key: unknown): string {
  if (!isConfigKey(key)) return 'Set sonification sound'
  const value = snapshot.config[key]
  switch (key) {
    case 'model':
      return `Sonification model: ${value}`
    case 'scale':
      return `Sonification scale: ${value}`
    case 'volume':
      return `Sonification volume: ${Math.round(Number(value) * 100)}%`
    case 'spatialSpread':
      return `Sonification spread: ${Math.round(Number(value) * 100)}%`
    case 'reverbMix':
      return `Sonification reverb: ${Math.round(Number(value) * 100)}%`
    case 'voiceCount':
      return `Sonification voices: ${value}`
    case 'harmonicDensity':
      return `Sonification harmonic density: ${value}x`
    case 'triggerRate':
      return `Sonification trigger rate: ${value}/s`
    case 'updateRate':
      return `Sonification update rate: ${value} Hz`
  }
}

registerCommand({
  id: 'sonification.setConfig',
  label: 'Set Sonification Sound',
  description: 'Set the authored model, scale, voices, space and effects',
  normalizeArgs(ctx, [config, key]) {
    const parsed = tryValidateSonificationConfig(config)
    if (!parsed) return [config, key]
    const snapshot = snapshotWith(ctx, { config: parsed })
    return snapshot ? [snapshot, key] : [config, key]
  },
  validateReplayArgs(args) {
    if (args.length !== 2 || !tryValidateSonificationSnapshot(args[0])) {
      return 'sonification config expects one bounded snapshot and control key'
    }
    return isConfigKey(args[1])
      ? undefined
      : 'sonification control key is invalid'
  },
  coalesceKey: ([, key]) =>
    isConfigKey(key) && CONTINUOUS_CONFIG_KEYS.has(key) ? key : undefined,
  describe: ([value, key]) => {
    const snapshot = tryValidateSonificationSnapshot(value)
    return snapshot ? describeConfig(snapshot, key) : undefined
  },
  execute(ctx, value?: unknown) {
    if (applySnapshot(ctx, value)) return
    // Ordinary dispatch reaches this legacy-shaped fallback only in a partial
    // sandbox with no snapshot seam. Imported sessions never accept it.
    const config = tryValidateSonificationConfig(value)
    if (config) ctx.sonification?.setConfig(deepClone(config))
  },
})

registerCommand({
  id: 'sonification.setEnabled',
  label: 'Toggle Sonification',
  description: 'Start or stop the authored sonification output',
  normalizeArgs(ctx, [enabled]) {
    if (typeof enabled !== 'boolean') return [enabled]
    return [snapshotWith(ctx, { enabled }) ?? enabled]
  },
  validateReplayArgs(args) {
    return args.length === 1 && tryValidateSonificationSnapshot(args[0])
      ? undefined
      : 'sonification enable expects one bounded snapshot'
  },
  describe: ([value]) => {
    const snapshot = tryValidateSonificationSnapshot(value)
    if (!snapshot) return undefined
    return snapshot.enabled ? 'Enable sonification' : 'Disable sonification'
  },
  execute(ctx, value?: unknown) {
    if (applySnapshot(ctx, value)) return
    if (typeof value === 'boolean') ctx.sonification?.setEnabled(value)
  },
})
