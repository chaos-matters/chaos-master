import { isSafeFlameEntityId, renderSettingsDefault, } from '@/flame/schema/flameSchema'
import { recordCommandExecution } from '@/recorder/recorder'
import { IS_DEV } from '../defaults'
import type { CommandContext, FlameCommand, ReplayArgsValidator } from './types'

const commandRegistry = new Map<string, FlameCommand>()

export function registerCommand(cmd: FlameCommand): void {
  commandRegistry.set(cmd.id, cmd)
}

export function getCommand(id: string): FlameCommand | undefined {
  return commandRegistry.get(id)
}

export function getAllCommands(): FlameCommand[] {
  return [...commandRegistry.values()]
}

const MAX_REPLAY_ARG_DEPTH = 16
const MAX_REPLAY_ARG_NODES = 50_000
const MAX_REPLAY_ARRAY_LENGTH = 4096
const MAX_REPLAY_OBJECT_KEYS = 4096
const MAX_REPLAY_STRING_LENGTH = 65_536
const MAX_REPLAY_SCALAR_MAGNITUDE = 1_000_000
const MAX_REPLAY_METADATA_LENGTH = 16_384
const FORBIDDEN_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

type ReplayArgGuard = (value: unknown) => boolean

function signature(...guards: ReplayArgGuard[]): ReplayArgsValidator {
  return (args) => {
    if (args.length !== guards.length) {
      return `expected exactly ${guards.length} argument${guards.length === 1 ? '' : 's'}`
    }
    return guards.every((guard, index) => guard(args[index]))
      ? undefined
      : 'arguments do not match the replay signature'
  }
}

function oneOfSignatures(
  ...validators: ReplayArgsValidator[]
): ReplayArgsValidator {
  return (args) =>
    validators.some((validator) => validator(args) === undefined)
      ? undefined
      : 'arguments do not match any replay signature'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoundedNumber(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= MAX_REPLAY_SCALAR_MAGNITUDE
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isShortString(value: unknown, maxLength = 512): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength
  )
}

function hasSafePropertyName(value: string): boolean {
  if (FORBIDDEN_PROPERTY_NAMES.has(value)) return false
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) < 32) return false
  }
  return true
}

function isEntityId(value: unknown): value is string {
  return isSafeFlameEntityId(value)
}

function isEntityRef(value: unknown): boolean {
  return (
    isEntityId(value) ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 100_000)
  )
}

function isOptionalEntityRef(value: unknown): boolean {
  return value === null || value === undefined || isEntityRef(value)
}

function isSafePath(value: unknown): value is string {
  if (!isShortString(value, 512)) return false
  return value
    .split('.')
    .every(
      (segment) =>
        segment.length > 0 &&
        hasSafePropertyName(segment) &&
        segment.length <= 128,
    )
}

function isReplaySettingValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return typeof value !== 'string' || value.length <= 512
  }
  if (isBoundedNumber(value)) return true
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 4 &&
    value.every(isBoundedNumber)
  ) {
    return true
  }
  if (isPlainRecord(value)) {
    return Object.values(value).every(
      (v) =>
        isBoundedNumber(v) ||
        (Array.isArray(v) && v.every(isBoundedNumber)) ||
        typeof v === 'boolean' ||
        typeof v === 'string',
    )
  }
  return false
}

function defaultAtPath(path: string): unknown {
  let node: unknown = renderSettingsDefault
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      return undefined
    }
    if (!(segment in node)) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

function renderSettingArgs(args: readonly unknown[]): string | undefined {
  if (args.length !== 2 || !isSafePath(args[0])) {
    return 'render setting expects a safe path and value'
  }
  const expected = defaultAtPath(args[0])
  if (expected === undefined) {
    return `unknown render setting path "${args[0]}"`
  }
  if (args[1] === null) {
    return args[0] === 'backgroundColor'
      ? undefined
      : 'only automatic background colour may be cleared'
  }
  return isReplaySettingValue(args[1])
    ? undefined
    : 'render setting value is invalid'
}

function isAffine(value: unknown): boolean {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value)
  const expected =
    keys.length === 12
      ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
      : ['a', 'b', 'c', 'd', 'e', 'f']
  return (
    keys.length === expected.length &&
    expected.every((key) => isBoundedNumber(value[key]))
  )
}

function isVariationDescriptor(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isShortString(value.type, 128) &&
    hasSafePropertyName(value.type)
  )
}

const noArgs = signature()
const oneBoolean = signature(isBoolean)
const oneNumber = signature(isBoundedNumber)
const oneRecord = signature(isPlainRecord)

function isMetadataPatch(value: unknown): boolean {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every(
      (key) =>
        (key === 'name' || key === 'author' || key === 'description') &&
        typeof value[key] === 'string' &&
        value[key].length <= MAX_REPLAY_METADATA_LENGTH,
    )
  )
}

/**
 * Explicit signatures for commands whose arguments are small scalar/data
 * shapes. Complex document payloads own a validator next to their command.
 * A command missing from both places is denied by default.
 */
const REPLAY_ARG_POLICIES: Readonly<Record<string, ReplayArgsValidator>> = {
  'camera.center': noArgs,
  'camera.zoomTo': signature(isFiniteNumber),
  'camera.zoomBy': signature(isFiniteNumber),
  'camera.panTo': signature(isBoundedNumber, isBoundedNumber),
  'camera.panBy': signature(isBoundedNumber, isBoundedNumber),
  'camera.frame': signature(isBoundedNumber, isBoundedNumber, isFiniteNumber),

  'view.setQualityPreset': signature(
    (value) =>
      value === 'low' ||
      value === 'mid' ||
      value === 'high' ||
      value === 'ultra',
  ),
  'view.setPixelRatio': signature(
    (value) => value === 1 || value === 0.5 || value === 0.25,
  ),
  'view.setAdaptiveFilter': oneBoolean,
  'view.setStochasticFilter': oneBoolean,
  'view.setFlyMode': oneBoolean,
  'view.setShowTimeline': oneBoolean,

  'sidebar.open': oneOfSignatures(noArgs, oneBoolean),
  'sidebar.close': noArgs,
  'export.png': noArgs,
  'export.animation': noArgs,

  'audio.setEnabled': oneBoolean,
  'audio.setSource': signature((value) => value === 'file' || value === 'mic'),

  'flame.setRenderSetting': renderSettingArgs,
  'flame.setSkipIters': oneOfSignatures(
    noArgs,
    signature(
      (value) =>
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= MAX_REPLAY_SCALAR_MAGNITUDE,
    ),
  ),
  'flame.addTransform': signature(isShortString, isEntityId, isEntityId),
  'flame.removeTransform': signature(isOptionalEntityRef),
  'flame.setVariationWeight': signature(
    isEntityRef,
    isEntityRef,
    isBoundedNumber,
  ),
  'flame.addVariation': signature(isEntityRef, isShortString, isEntityId),
  'flame.setColorSpeed': signature(isEntityRef, isBoundedNumber),
  'flame.loadPreset': signature((value) => isShortString(value, 128)),
  'flame.setBlendWeight': signature(
    (value) => isFiniteNumber(value) && value >= 0 && value <= 1,
  ),
  'flame.setBlendFlame': signature(
    (value) => value === null || isPlainRecord(value),
  ),
  'flame.setupMorph': oneRecord,
  'flame.updateRenderSettings': oneOfSignatures(
    oneRecord,
    signature(
      isPlainRecord,
      (value) => value === 'render' || value === 'randomizer',
    ),
  ),
  'flame.setProbability': signature(isEntityRef, isBoundedNumber),
  'flame.setAffine': signature(
    isEntityRef,
    (value) => value === 'pre' || value === 'post',
    (value) =>
      typeof value === 'string' &&
      value.length === 1 &&
      value >= 'a' &&
      value <= 'l',
    isBoundedNumber,
  ),
  'flame.setTransformColor': oneOfSignatures(
    signature(isEntityRef, isBoundedNumber, isBoundedNumber),
    signature(
      isEntityRef,
      isBoundedNumber,
      isBoundedNumber,
      (value) =>
        value === 'grid' ||
        value === 'x' ||
        value === 'y' ||
        value === 'randomize' ||
        value === 'card-randomize' ||
        value === 'reset',
    ),
  ),
  'flame.setExposure': oneNumber,
  'flame.setVibrancy': oneNumber,
  'flame.setGamma': oneNumber,
  'flame.setContrast': oneNumber,
  'flame.setBackgroundColor': signature(
    isBoundedNumber,
    isBoundedNumber,
    isBoundedNumber,
  ),
  'flame.setDrawMode': signature(
    (value) => value === 'light' || value === 'paint',
  ),
  'flame.clearTransforms': noArgs,
  'flame.reset': noArgs,
  'flame.setVariationParams': signature(
    isEntityRef,
    isEntityRef,
    (value) => isShortString(value, 128) && hasSafePropertyName(value),
    isBoundedNumber,
  ),
  'flame.setTransformVisible': signature(isEntityRef, isBoolean),
  'flame.setVariationVisible': signature(isEntityRef, isEntityRef, isBoolean),
  'flame.setVariation': signature(
    isEntityRef,
    isEntityRef,
    isVariationDescriptor,
  ),
  'flame.deleteTransform': signature(isEntityRef, isEntityId),
  'flame.deleteVariation': signature(isEntityRef, isEntityRef),
  'flame.setFinalTransform': oneOfSignatures(
    signature((value) => value === null || isAffine(value)),
    signature(
      (value) => value === null || isAffine(value),
      (value) => value === 'grid' || value === 'randomize',
    ),
  ),
  'flame.setFinalAffine': signature(
    (value) =>
      typeof value === 'string' &&
      value.length === 1 &&
      value >= 'a' &&
      value <= 'l',
    isBoundedNumber,
  ),
  'flame.applyVariationSelection': signature(
    isEntityRef,
    isEntityRef,
    isAffine,
    isVariationDescriptor,
  ),
  'flame.setTransformAffine': oneOfSignatures(
    signature(
      isEntityRef,
      (value) => value === 'pre' || value === 'post',
      isAffine,
    ),
    signature(
      isEntityRef,
      (value) => value === 'pre' || value === 'post',
      isAffine,
      (value) => value === 'grid' || value === 'randomize' || value === 'reset',
    ),
  ),
  'flame.removePalette': oneRecord,
  'flame.setMetadata': oneOfSignatures(
    signature(
      (value) =>
        value === 'name' || value === 'author' || value === 'description',
      (value) =>
        typeof value === 'string' && value.length <= MAX_REPLAY_METADATA_LENGTH,
    ),
    signature(isMetadataPatch),
  ),
  'flame.setAllTransformColors': oneRecord,
}

export function hasExplicitReplayPolicy(command: FlameCommand): boolean {
  return (
    command.replayable === false ||
    command.validateReplayArgs !== undefined ||
    Object.hasOwn(REPLAY_ARG_POLICIES, command.id)
  )
}

/** Generic JSON-shape budget applied before any command-specific normalizer. */
function replayArgBudgetError(root: unknown): string | undefined {
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }]
  const seen = new WeakSet<object>()
  let nodes = 0

  while (stack.length > 0) {
    const current = stack.pop()!
    nodes++
    if (nodes > MAX_REPLAY_ARG_NODES) return 'argument data is too large'
    if (current.depth > MAX_REPLAY_ARG_DEPTH) {
      return 'argument data is nested too deeply'
    }

    const value = current.value
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      continue
    }
    if (typeof value === 'string') {
      if (value.length > MAX_REPLAY_STRING_LENGTH) {
        return 'an argument string is too long'
      }
      continue
    }
    if (typeof value !== 'object') return 'arguments must be finite JSON data'

    if (seen.has(value)) return 'arguments must not contain cycles'
    seen.add(value)
    if (Array.isArray(value)) {
      if (value.length > MAX_REPLAY_ARRAY_LENGTH) {
        return 'an argument array is too long'
      }
      for (const item of value) {
        stack.push({ value: item, depth: current.depth + 1 })
      }
      continue
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return 'arguments must contain plain JSON objects only'
    }
    const entries = Object.values(value)
    if (entries.length > MAX_REPLAY_OBJECT_KEYS) {
      return 'an argument object has too many fields'
    }
    for (const item of entries) {
      stack.push({ value: item, depth: current.depth + 1 })
    }
  }
  return undefined
}

function runCommand(
  cmd: FlameCommand,
  ctx: CommandContext,
  args: unknown[],
): void {
  const finalArgs = cmd.normalizeArgs ? cmd.normalizeArgs(ctx, args) : args
  recordCommandExecution(cmd, finalArgs, () => {
    cmd.execute(ctx, ...finalArgs)
  })
}

export function executeCommand(
  id: string,
  ctx: CommandContext,
  ...args: unknown[]
): void {
  const cmd = commandRegistry.get(id)
  if (!cmd) {
    if (IS_DEV) console.warn(`Command "${id}" not found in registry`)
    return
  }
  // Timed replay can own a long-lived undo preview while it waits between
  // steps. Every live command — including timeline/audio/view-only commands
  // that never touch flame history — takes the workspace back before it runs.
  // `executeReplayCommand` intentionally skips this live-dispatch hook.
  ctx.beforeCommand?.()
  if (IS_DEV) console.info('[cmd:execute]', id, 'args:', ...args)
  runCommand(cmd, ctx, args)
}

/** Validate one canonical recorded action without touching workspace state. */
export function preflightReplayCommand(
  id: string,
  args: readonly unknown[],
): string | undefined {
  const cmd = commandRegistry.get(id)
  if (!cmd) return `Unknown replay command "${id}"`
  if (cmd.replayable === false) return `${cmd.label} is not replayable`
  const validator =
    cmd.validateReplayArgs ??
    (Object.hasOwn(REPLAY_ARG_POLICIES, id)
      ? REPLAY_ARG_POLICIES[id]
      : undefined)
  if (!validator) return `${cmd.label} has no explicit replay policy`
  return replayArgBudgetError(args) ?? validator(args)
}

/**
 * Execute one action loaded from a `.steps.json` file.
 *
 * Unlike ordinary in-app dispatch, this rejects unknown commands and applies
 * size/domain checks before `normalizeArgs`, where an attacker-sized value
 * could otherwise allocate before a command's execute-time guard runs.
 */
export function executeReplayCommand(
  id: string,
  ctx: CommandContext,
  ...args: unknown[]
): boolean {
  const cmd = commandRegistry.get(id)
  const commandError = preflightReplayCommand(id, args)
  if (commandError !== undefined) {
    console.warn(`[recorder] Rejected ${id}: ${commandError}`)
    return false
  }
  if (!cmd) return false
  try {
    // Normal dispatch canonicalized these args before recording. Re-running
    // normalizeArgs here could mint fresh ids or allocate hostile sizes.
    cmd.execute(ctx, ...args)
    return true
  } catch (error) {
    console.warn(`[recorder] Replay command ${id} failed`, error)
    return false
  }
}
