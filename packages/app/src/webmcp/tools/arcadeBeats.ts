import { BUNDLED_TRACKS, findBundledTrack } from '@/arcade/bundledTracks'
import { describeAllowedCommands } from '@/arcade/commandHints'
import { qualityRank } from '@/arcade/guard'
import { clearNarration } from '@/arcade/narration'
import { agentDriving, drivingState, notePilotStep, pilotStepsRemaining, startPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { ALWAYS_ALLOWED, BEATS_ALLOWED, BEATS_STEP_BUDGET, } from '@/arcade/topics'
import { executeCommand } from '@/commands/registry'
import { AudioMapping, AudioPreset } from '@/flame/schema/audioWiring'
import * as v from '@/valibot'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { CommandContext } from '@/commands/types'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}

const AUDIO_FEATURE_DESCRIPTIONS = [
  {
    id: 'subBass',
    description:
      'Deep low frequencies (< 60 Hz), drives heavy kicks and sub drops',
  },
  {
    id: 'bass',
    description:
      'Bass range (60-250 Hz), drives rhythm, basslines and scale pulses',
  },
  {
    id: 'lowMid',
    description: 'Low mid-range (250-500 Hz), body and chord warmth',
  },
  {
    id: 'mid',
    description: 'Mid-range (500-2000 Hz), leads and structural movement',
  },
  { id: 'hiMid', description: 'High mids (2-4 kHz), attack and clarity' },
  { id: 'presence', description: 'Presence (4-6 kHz), crisp definition' },
  {
    id: 'brilliance',
    description: 'Air and shimmer (> 6 kHz), cymbals and high sparkle',
  },
  {
    id: 'beat',
    description:
      'Beat detector pulse (0 or 1), fires sharply on rhythmic beats',
  },
  {
    id: 'onset',
    description:
      'Transient onset energy detector, fires on sudden percussive spikes',
  },
  {
    id: 'rms',
    description: 'Root-mean-square overall audio volume and dynamic energy',
  },
] as const

const AUDIO_PRESET_DESCRIPTIONS = [
  {
    id: 'pulse',
    description: 'Bass-driven scale expansion and exposure breathing',
  },
  {
    id: 'bloom',
    description: 'Mid-range color blossoming and palette speed sweeps',
  },
  {
    id: 'drift',
    description: 'Subtle affine rotation and translation floating with melody',
  },
  {
    id: 'structure',
    description:
      'Beat-synced transform probability and variation weight shifts',
  },
  {
    id: 'morph',
    description: 'Energetic geometry morphing between non-linear variations',
  },
  {
    id: 'swarm',
    description: 'High-frequency particle vibrancy and fast color modulation',
  },
] as const

/**
 * Make sure a decoded track is loaded before a Beats session starts. Without
 * one, audio.applySnapshot's canEnable check fails and the mapping step turns
 * reactivity straight back off, so the session saves with nothing reactive.
 * A track that is already usable -- bundled, or the user's own file -- is kept.
 */
async function ensureBeatsTrack(
  audio: NonNullable<CommandContext['audio']>,
  requested: string | undefined,
): Promise<{ trackName: string } | { error: string }> {
  const current = audio.snapshot()
  const usable = (trackName: string) =>
    audio.canEnable({ ...current, source: 'file', enabled: true, trackName })

  const track =
    requested === undefined ? undefined : findBundledTrack(requested)
  const wanted = track?.name ?? requested
  if (wanted === undefined) {
    if (current.trackName !== undefined && usable(current.trackName)) {
      return { trackName: current.trackName }
    }
  } else if (usable(wanted)) {
    return { trackName: wanted }
  }

  if (requested !== undefined && track === undefined) {
    const names = BUNDLED_TRACKS.map((t) => t.name).join(', ')
    return { error: `Unknown track "${requested}". Bundled tracks: ${names}.` }
  }
  const target = track ?? BUNDLED_TRACKS[0]!
  if (!audio.loadBundledTrack) {
    return { error: 'This workspace cannot load audio tracks.' }
  }
  try {
    await audio.loadBundledTrack(target)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { error: `Could not load "${target.name}": ${reason}` }
  }
  return { trackName: target.name }
}

export const arcadeStartBeats: WebMcpTool = {
  name: 'arcade_start_beats',
  description:
    'Start a Beats session on the current flame: locks the editor, enables audio reactivity and starts recording. Then call arcade_get_audio_catalog, then arcade_set_audio_mapping (which applies the audio modulation), and finish with arcade_end_beats.',
  inputSchema: {
    type: 'object',
    properties: {
      trackName: {
        type: 'string',
        description: 'Optional name of the track to wire against',
      },
    },
  },
  execute: async (args: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.recorder || !ctx.arcade || !ctx.audio) {
      return {
        error: 'This workspace does not support audio-reactive recording.',
      }
    }
    if (agentDriving()) {
      return {
        error: 'An Arcade session is already active. Finish or stop it first.',
      }
    }
    if (ctx.recorder.isRecording()) {
      return {
        error: 'A recording is already running. Ask the user to stop it first.',
      }
    }

    const parsedArgs =
      typeof args === 'object' && args !== null
        ? (args as { trackName?: string })
        : {}
    // Before recording starts, so a track that cannot load leaves nothing
    // half-started behind.
    const loaded = await ensureBeatsTrack(ctx.audio, parsedArgs.trackName)
    if ('error' in loaded) return { error: loaded.error }

    const started = ctx.recorder.start()
    if (!started.ok) {
      return { error: `Could not start recording: ${started.reason}` }
    }

    const allowed = [...BEATS_ALLOWED, ...ALWAYS_ALLOWED]
    const result = startPilot({
      mode: 'beats',
      title: 'Wiring your flame to the beat',
      stepBudget: BEATS_STEP_BUDGET,
      allowed,
      qualityRankAtStart: qualityRank(ctx.arcade.qualityPreset()),
    })
    if (!result.ok) {
      ctx.recorder.cancel()
      return { error: result.error }
    }

    clearNarration()
    ctx.arcade.closeHub()
    // Beats drives the flame from the track just ensured. A microphone chosen
    // earlier in the session would otherwise keep driving it, and the mapping
    // step would report no track loaded when one is.
    ctx.audio.setSource('file')
    ctx.audio.setEnabled(true)

    const activeTrack = loaded.trackName

    return {
      ok: true,
      stepBudget: BEATS_STEP_BUDGET,
      allowedCommands: describeAllowedCommands(allowed),
      activeTrack,
      tips: [
        'Call arcade_get_audio_catalog first to inspect available modulation targets and audio features.',
        'Wire low frequencies (subBass, bass) to structural properties or scale, and high frequencies (brilliance, presence) to colorSpeed or variation weights.',
        'Call arcade_set_audio_mapping with your mappings array. Provide a rationale to explain your creative choices as a caption.',
        'Finish with arcade_end_beats when your audio-reactive configuration is complete.',
      ],
    }
  },
}

export const arcadeGetAudioCatalog: WebMcpTool = {
  name: 'arcade_get_audio_catalog',
  description:
    'Inspect valid audio-reactive modulation targets for the current flame, supported spectral features, and active track info.',
  inputSchema: { type: 'object', properties: {} },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY

    const flame = ctx.flameDescriptor()
    const transformEntries = Object.entries(flame.transforms ?? {})

    const transforms = transformEntries.map(([id, transform], index) => ({
      index,
      id,
      affineParams: ['a', 'b', 'c', 'd', 'e', 'f'],
      properties: ['probability', 'colorSpeed'],
      variations: Object.entries(transform.variations ?? {}).map(
        ([, variation]) => ({
          type: variation.type,
          weight: variation.weight,
        }),
      ),
    }))

    const audioSnapshot = ctx.audio?.snapshot()

    return {
      features: AUDIO_FEATURE_DESCRIPTIONS,
      presets: AUDIO_PRESET_DESCRIPTIONS,
      targets: {
        renderSettings: [
          'vibrancy',
          'exposure',
          'palettePhase',
          'paletteSpeed',
          'contrast',
          'gamma',
          'highlightPower',
          'lightPower',
          'depthColorPower',
          'zoom',
        ],
        transforms,
        finalAffine: flame.finalTransform
          ? ['a', 'b', 'c', 'd', 'e', 'f']
          : undefined,
      },
      currentTrack: {
        name: audioSnapshot?.trackName ?? 'Ember Drift',
        source: audioSnapshot?.source ?? 'file',
        enabled: audioSnapshot?.enabled ?? true,
      },
      currentPreset: audioSnapshot?.mapping.preset ?? 'custom',
      existingMappingCount: audioSnapshot?.mapping.mappings.length ?? 0,
    }
  },
}

export const arcadeSetAudioMapping: WebMcpTool = {
  name: 'arcade_set_audio_mapping',
  description:
    'Apply an audio-reactive parameter mapping to the flame, wiring spectral bands to flame parameters.',
  inputSchema: {
    type: 'object',
    properties: {
      preset: {
        type: 'string',
        enum: [
          'pulse',
          'bloom',
          'drift',
          'structure',
          'morph',
          'swarm',
          'custom',
        ],
        description: 'Optional high-level audio wiring preset category',
      },
      mappings: {
        type: 'array',
        description: 'List of audio-reactive parameter mappings',
        items: {
          type: 'object',
          required: ['audioFeature', 'target', 'sensitivity', 'range'],
          properties: {
            audioFeature: {
              type: 'string',
              description:
                'Spectral band or detector (e.g. "subBass", "bass", "mid", "presence", "beat")',
            },
            target: {
              type: 'object',
              description:
                'Target parameter object (e.g. { kind: "renderSetting", param: "exposure" } or { kind: "transformAffine", transformIdx: 0, matrix: "preAffine", param: "a" })',
            },
            sensitivity: {
              type: 'number',
              description:
                'Modulation intensity multiplier (typically 0.1 to 3.0)',
            },
            range: {
              type: 'array',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
              description:
                'Output value range [min, max] for the target parameter',
            },
            attackMs: {
              type: 'number',
              description:
                'Optional attack time in milliseconds (0 for instant)',
            },
            releaseMs: {
              type: 'number',
              description: 'Optional release decay time in milliseconds',
            },
          },
        },
      },
      rationale: {
        type: 'string',
        description:
          'Brief explanation of this musical wiring choice (under 25 words), narrated as a caption',
      },
    },
    required: ['mappings'],
  },
  execute: (args: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.audio) {
      return { error: 'Audio system is not available in this workspace.' }
    }

    const state = drivingState()
    if (state?.mode !== 'beats') {
      return {
        error:
          'arcade_set_audio_mapping is only available while Beats mode is active. Call arcade_start_beats first.',
      }
    }

    if (typeof args !== 'object' || args === null) {
      return { error: 'Arguments must be an object with a mappings array.' }
    }

    const raw = args as {
      preset?: unknown
      mappings?: unknown
      rationale?: unknown
    }

    const presetParsed = v.safeParse(AudioPreset, raw.preset ?? 'custom')
    const preset = presetParsed.success ? presetParsed.output : 'custom'

    const mappingCandidate = {
      preset,
      mappings: raw.mappings,
    }

    const parsed = v.safeParse(AudioMapping, mappingCandidate)
    if (!parsed.success) {
      return {
        error: `Invalid audio mapping structure: ${parsed.issues.map((i) => i.message).join('; ')}`,
      }
    }

    const currentSnapshot = ctx.audio.snapshot()
    const newSnapshot: AudioWiringSnapshot = {
      mapping: parsed.output,
      enabled: true,
      source: currentSnapshot.source ?? 'file',
      trackName: currentSnapshot.trackName ?? 'Ember Drift',
    }

    const noteText =
      typeof raw.rationale === 'string' && raw.rationale.trim().length > 0
        ? raw.rationale.trim()
        : undefined

    notePilotStep(
      'command',
      noteText ? `Audio mapping: ${noteText}` : 'Update audio mapping',
    )
    executeCommand('audio.applySnapshot', ctx, newSnapshot)

    if (noteText) {
      executeCommand('lesson.note', ctx, noteText)
    }

    // applySnapshot only switches reactivity on when a matching decoded track
    // is loaded. Say so, rather than reporting a reactive session that is not.
    const reactive = ctx.audio.canEnable(newSnapshot)

    return {
      ok: true,
      reactive,
      ...(reactive
        ? {}
        : {
            warning:
              'The mapping is saved, but no audio track is loaded, so reactivity is off. Start Beats again to load a track.',
          }),
      appliedCount: parsed.output.mappings.length,
      preset: parsed.output.preset,
      remainingSteps: pilotStepsRemaining(),
      note: noteText,
    }
  },
}

export const arcadeEndBeats: WebMcpTool = {
  name: 'arcade_end_beats',
  description:
    'End the Beats session, save the audio-reactive take to the session library, and lift the lock.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description:
          'Short title for the saved beats session (e.g. "Ember Pulse Groove")',
      },
      summary: {
        type: 'string',
        description: 'One-line summary of how the flame dances to the music',
      },
    },
  },
  execute: async (args: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY

    const state = drivingState()
    if (state?.mode !== 'beats') {
      return {
        error: 'No active Beats session to end. Call arcade_start_beats first.',
      }
    }

    const parsedArgs =
      typeof args === 'object' && args !== null
        ? (args as { title?: string; summary?: string })
        : {}

    const flameName = ctx.flameDescriptor().metadata?.name ?? 'Flame'
    const title = parsedArgs.title?.trim() || `Beats: ${flameName}`
    const summary =
      parsedArgs.summary?.trim() || 'Audio-reactive modulation take'

    await finishPilot(ctx, 'finished', {
      title,
      summary,
    })

    return {
      ok: true,
      title,
      summary,
      message: 'Beats session completed and saved to library.',
    }
  },
}
