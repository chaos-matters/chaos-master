import { AudioMapping } from '@/flame/schema/audioWiring'
import * as v from '@/valibot'
import { registerCommand } from '../registry'

/**
 * Audio-reactive wiring as commands.
 *
 * The wiring is not part of the flame descriptor and never touched the undo
 * stack, so before these existed an audio session recorded as nothing at all —
 * not even as unnamed writes. Someone wiring bass to zoom on camera produced a
 * `.steps.json` that replayed a completely silent, still flame.
 *
 * What a session CANNOT carry is the audio itself: a buffer is not JSON. The
 * mapping replays; the track has to be supplied again, and the session names
 * it (`trackName`) so a replay can say which one.
 */

registerCommand({
  id: 'audio.setMapping',
  label: 'Set Audio Wiring',
  description:
    'Replace the audio-reactive mapping (preset and per-target rows)',
  // The panel re-emits the whole mapping on every slider nudge inside a row.
  // One drag is one wiring change, not forty.
  coalesceKey: () => 'mapping',
  describe: ([mapping]) => {
    const parsed = v.safeParse(AudioMapping, mapping)
    if (!parsed.success) return undefined
    const count = parsed.output.mappings.length
    return `Wire audio: ${parsed.output.preset} (${count} target${count === 1 ? '' : 's'})`
  },
  execute(ctx, mapping?: unknown) {
    // Validated here rather than trusted: a mapping drives writes into the
    // descriptor by transform index and key on every audio frame, so a
    // hand-edited session could otherwise scribble over the document 30
    // times a second.
    const parsed = v.safeParse(AudioMapping, mapping)
    if (!parsed.success) {
      console.warn('[cmd] audio.setMapping: rejected', mapping)
      return
    }
    ctx.audio?.setMapping(parsed.output)
  },
})

registerCommand({
  id: 'audio.setEnabled',
  label: 'Toggle Audio Reactivity',
  description: 'Start or stop driving the flame from audio',
  describe: ([enabled]) =>
    typeof enabled === 'boolean'
      ? enabled
        ? 'Enable audio reactivity'
        : 'Disable audio reactivity'
      : undefined,
  execute(ctx, enabled?: unknown) {
    if (typeof enabled !== 'boolean') return
    ctx.audio?.setEnabled(enabled)
  },
})

registerCommand({
  id: 'audio.setSource',
  label: 'Set Audio Source',
  description: 'Drive from a loaded file or from the microphone',
  describe: ([source]) =>
    source === 'file' || source === 'mic'
      ? `Audio source: ${source}`
      : undefined,
  execute(ctx, source?: unknown) {
    if (source !== 'file' && source !== 'mic') return
    ctx.audio?.setSource(source)
  },
})
