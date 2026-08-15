import { batch } from 'solid-js'
import { AudioMapping, AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import { deepClone } from '@/utils/clone'
import * as v from '@/valibot'
import { registerCommand } from '../registry'
import type { CommandContext } from '../types'

/**
 * Audio-reactive wiring as commands.
 *
 * The wiring is not part of the flame descriptor and never touched the undo
 * stack, so before these existed an audio session recorded as nothing at all —
 * not even as unnamed writes. Someone wiring bass to zoom on camera produced a
 * `.steps.json` that replayed a completely silent, still flame.
 *
 * What a session CANNOT carry is the audio itself: a buffer is not JSON. Each
 * new action therefore records the complete serializable wiring snapshot,
 * including the required track name. Replaying that snapshot may enable only
 * through the workspace's resource-authorization seam.
 */

function parseSnapshot(value: unknown) {
  const parsed = v.safeParse(AudioWiringSnapshot, value)
  return parsed.success ? parsed.output : undefined
}

function snapshotWith(
  ctx: CommandContext,
  patch: Partial<AudioWiringSnapshot>,
): AudioWiringSnapshot | undefined {
  const current = ctx.audio?.snapshot()
  if (!current) return undefined
  return parseSnapshot({ ...deepClone(current), ...deepClone(patch) })
}

function continuousMappingChangeKey(
  before: AudioWiringSnapshot['mapping'],
  after: AudioWiringSnapshot['mapping'],
): string | undefined {
  if (before.mappings.length !== after.mappings.length) return undefined
  // Editing a row turns a named preset into "custom". That transition still
  // belongs to the slider gesture; switching to another named preset does not.
  if (before.preset !== after.preset && after.preset !== 'custom') {
    return undefined
  }

  const changed: string[] = []
  for (let index = 0; index < before.mappings.length; index++) {
    const previous = before.mappings[index]!
    const next = after.mappings[index]!
    if (
      previous.audioFeature !== next.audioFeature ||
      JSON.stringify(previous.target) !== JSON.stringify(next.target)
    ) {
      return undefined
    }
    if (previous.sensitivity !== next.sensitivity) {
      changed.push(`${index}:sensitivity`)
    }
    if (previous.range[0] !== next.range[0]) changed.push(`${index}:range-min`)
    if (previous.range[1] !== next.range[1]) changed.push(`${index}:range-max`)
    if (previous.attackMs !== next.attackMs) changed.push(`${index}:attack`)
    if (previous.releaseMs !== next.releaseMs) changed.push(`${index}:release`)
  }

  return changed.length === 1 ? changed[0] : undefined
}

function applySnapshot(ctx: CommandContext, value: unknown): boolean {
  const snapshot = parseSnapshot(value)
  const audio = ctx.audio
  if (!snapshot || !audio) return false

  const mayEnable = snapshot.enabled && audio.canEnable(snapshot)
  batch(() => {
    // Disable first so mapping/source replacement can never drive an
    // unrelated resource, even transiently between signal writes.
    audio.setEnabled(false)
    audio.setMapping(deepClone(snapshot.mapping))
    audio.setSource(snapshot.source)
    if (mayEnable) audio.setEnabled(true)
  })
  return true
}

function snapshotReplayError(args: readonly unknown[]): string | undefined {
  if (args.length !== 1) return 'audio wiring expects one snapshot'
  return parseSnapshot(args[0]) ? undefined : 'audio wiring snapshot is invalid'
}

registerCommand({
  id: 'audio.setMapping',
  label: 'Set Audio Wiring',
  description:
    'Replace the audio-reactive mapping (preset and per-target rows)',
  // Only repeated values from the same continuous field may fold together.
  // Presets, row edits and separate slider gestures remain chronological.
  coalesceKey: (args) => (typeof args[1] === 'string' ? args[1] : undefined),
  normalizeArgs(ctx, [mapping]) {
    const parsed = v.safeParse(AudioMapping, mapping)
    if (!parsed.success) return [mapping]
    const before = ctx.audio?.snapshot()
    const snapshot = snapshotWith(ctx, { mapping: parsed.output })
    if (!snapshot) return [mapping]
    const key = before
      ? continuousMappingChangeKey(before.mapping, snapshot.mapping)
      : undefined
    return key ? [snapshot, key] : [snapshot]
  },
  describe: ([value]) => {
    const mapping = parseSnapshot(value)?.mapping ?? value
    const parsed = v.safeParse(AudioMapping, mapping)
    if (!parsed.success) return undefined
    const count = parsed.output.mappings.length
    return `Wire audio: ${parsed.output.preset} (${count} target${count === 1 ? '' : 's'})`
  },
  validateReplayArgs(args) {
    if (args.length !== 1 && args.length !== 2) {
      return 'audio wiring expects one mapping and optional gesture key'
    }
    if (
      args.length === 2 &&
      (typeof args[1] !== 'string' || !/^\d+:[a-z-]+$/.test(args[1]))
    ) {
      return 'audio wiring gesture key is invalid'
    }
    if (parseSnapshot(args[0])) return undefined
    return v.safeParse(AudioMapping, args[0]).success
      ? undefined
      : 'audio mapping is invalid'
  },
  execute(ctx, value?: unknown, _gestureKey?: unknown) {
    if (applySnapshot(ctx, value)) return

    // Validated here rather than trusted: a mapping drives writes into the
    // descriptor by transform index and key on every audio frame, so a
    // hand-edited session could otherwise scribble over the document 30
    // times a second.
    const parsed = v.safeParse(AudioMapping, value)
    if (!parsed.success) {
      console.warn('[cmd] audio.setMapping: rejected', value)
      return
    }
    // Legacy mapping-only actions carry no file identity. They remain
    // importable, but cannot keep an unrelated resource running.
    const audio = ctx.audio
    if (!audio) return
    batch(() => {
      audio.setEnabled(false)
      audio.setMapping(parsed.output)
    })
  },
})

registerCommand({
  id: 'audio.setEnabled',
  label: 'Toggle Audio Reactivity',
  description: 'Start or stop driving the flame from audio',
  normalizeArgs(ctx, [enabled]) {
    if (typeof enabled !== 'boolean') return [enabled]
    return [snapshotWith(ctx, { enabled }) ?? enabled]
  },
  describe: ([value]) => {
    const enabled = parseSnapshot(value)?.enabled ?? value
    return typeof enabled === 'boolean'
      ? enabled
        ? 'Enable audio reactivity'
        : 'Disable audio reactivity'
      : undefined
  },
  validateReplayArgs(args) {
    if (args.length !== 1) return 'audio enable expects one wiring snapshot'
    if (parseSnapshot(args[0])) return undefined
    if (args[0] === false) return undefined
    if (args[0] === true) {
      return 'legacy audio enable has no recorded resource identity'
    }
    return 'audio enable wiring snapshot is invalid'
  },
  execute(ctx, value?: unknown) {
    if (applySnapshot(ctx, value)) return
    // `false` is the only safe legacy form: turning a resource off requires
    // no identity. Legacy `true` is rejected during replay preflight.
    if (value === false) ctx.audio?.setEnabled(false)
  },
})

registerCommand({
  id: 'audio.setSource',
  label: 'Set Audio Source',
  description: 'Drive from a loaded file or from the microphone',
  normalizeArgs(ctx, [source]) {
    if (source !== 'file' && source !== 'mic') return [source]
    return [snapshotWith(ctx, { source }) ?? source]
  },
  describe: ([value]) => {
    const source = parseSnapshot(value)?.source ?? value
    return source === 'file' || source === 'mic'
      ? `Audio source: ${source}`
      : undefined
  },
  validateReplayArgs(args) {
    if (args.length !== 1) return 'audio source expects one wiring snapshot'
    if (parseSnapshot(args[0])) return undefined
    return args[0] === 'file' || args[0] === 'mic'
      ? undefined
      : 'audio source wiring snapshot is invalid'
  },
  execute(ctx, value?: unknown) {
    if (applySnapshot(ctx, value)) return
    const source = value
    if (source !== 'file' && source !== 'mic') return
    // A legacy source-only action cannot prove which file or microphone was
    // active in the recording. Preserve the selection, never the unsafe run.
    const audio = ctx.audio
    if (!audio) return
    batch(() => {
      audio.setEnabled(false)
      audio.setSource(source)
    })
  },
})

/**
 * Record the serializable side of a file upload/clear after the workspace has
 * updated its actual resource. No bytes enter the log; replay restores the
 * wiring and enables it only if the viewer independently supplied the same
 * resource. Calling with no args snapshots the live workspace.
 */
registerCommand({
  id: 'audio.applySnapshot',
  label: 'Update Audio Resource',
  description: 'Capture audio wiring after loading or clearing a resource',
  normalizeArgs(ctx, args) {
    const value = args.length > 0 ? args[0] : ctx.audio?.snapshot()
    const snapshot = parseSnapshot(value)
    return snapshot ? [deepClone(snapshot)] : args
  },
  validateReplayArgs: snapshotReplayError,
  describe: ([value]) => {
    const snapshot = parseSnapshot(value)
    if (!snapshot) return undefined
    if (snapshot.source === 'mic') return 'Use microphone audio'
    return snapshot.trackName
      ? `Use audio: ${snapshot.trackName}`
      : 'Clear audio track'
  },
  execute(ctx, value?: unknown) {
    applySnapshot(ctx, value)
  },
})
