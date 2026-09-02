import { buildAnimatableCatalog, buildTimelineSnapshot, MAX_CINEMA_FRAMES, MAX_CINEMA_KEYFRAMES_PER_TRACK, MAX_CINEMA_TRACKS, } from '@/arcade/animatablePaths'
import { describeAllowedCommands } from '@/arcade/commandHints'
import { qualityRank } from '@/arcade/guard'
import { clearNarration } from '@/arcade/narration'
import { agentDriving, drivingState, notePilotStep, pilotStepsRemaining, startPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { ALWAYS_ALLOWED, CINEMA_ALLOWED, CINEMA_STEP_BUDGET, } from '@/arcade/topics'
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { withRecordingSuppressed } from '@/recorder/recorder'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { CatalogEntry } from '@/arcade/animatablePaths'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}
const EASINGS = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
]
const INTERPS = ['linear', 'constant', 'spline']

export const arcadeStartCinema: WebMcpTool = {
  name: 'arcade_start_cinema',
  description:
    'Start a Cinema session on the current flame: locks the editor, starts recording and opens the timeline. Then call arcade_get_animatable_paths, then arcade_set_keyframes (which plays the result), and finish with arcade_end_cinema.',
  inputSchema: { type: 'object', properties: {} },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.recorder || !ctx.arcade) {
      return { error: 'This workspace cannot record sessions.' }
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
    const started = ctx.recorder.start()
    if (!started.ok) {
      return { error: `Could not start recording: ${started.reason}` }
    }
    const allowed = [...CINEMA_ALLOWED, ...ALWAYS_ALLOWED]
    const result = startPilot({
      mode: 'cinema',
      title: 'Animating your flame',
      stepBudget: CINEMA_STEP_BUDGET,
      allowed,
      qualityRankAtStart: qualityRank(ctx.arcade.qualityPreset()),
    })
    if (!result.ok) {
      ctx.recorder.cancel()
      return { error: result.error }
    }
    clearNarration()
    ctx.arcade.closeHub()
    executeCommand('view.setShowTimeline', ctx, true)
    return {
      ok: true,
      stepBudget: CINEMA_STEP_BUDGET,
      allowedCommands: describeAllowedCommands(allowed),
      tips: [
        'Call arcade_get_animatable_paths first.',
        'arcade_set_keyframes replaces the whole animation; send all tracks each time.',
        'Keep it under 10 seconds unless asked; use easeInOut for camera moves.',
      ],
    }
  },
}

/** How many transforms get their variation weights listed before the result
 *  would blow the ~1.5 KB tool-result budget. */
const MAX_LISTED_TRANSFORMS = 8

/** Every transform exposes the same paths, so the grammar is stated once
 *  instead of repeated for each one. */
const TRANSFORM_PATHS =
  'transform.<id>.{preAffine|postAffine}.{a-f} | transform.<id>.{probability|colorSpeed|color.x|color.y} | <id>.<variationId> weight | finalTransform.{a-f}'

function summarize(
  catalog: CatalogEntry[],
  config: { fps: number; endFrame: number; loopMode?: string } | undefined,
) {
  // `type` is dropped for numbers, which is nearly every path; the tool
  // description says so. It is the single biggest saving in this result.
  const simple = (group: string) =>
    catalog
      .filter((entry) => entry.group === group)
      .map((entry) => ({
        path: entry.path,
        type: entry.type === 'number' ? undefined : entry.type,
        current: entry.current,
      }))
  const transformIds = [
    ...new Set(
      catalog
        .filter((entry) => entry.path.startsWith('transform.'))
        .map((entry) => entry.path.split('.')[1]!),
    ),
  ]
  const listed = transformIds.slice(0, MAX_LISTED_TRANSFORMS)
  return {
    render: simple('Render'),
    palette: simple('Palette'),
    color: simple('Color'),
    camera: simple('Camera'),
    transformPaths: TRANSFORM_PATHS,
    transforms: listed.map((id) => ({
      id,
      // Keyed by variation id, not the full path: the transform id is right
      // there in `id`, and repeating it in every key is pure budget.
      variations: Object.fromEntries(
        catalog
          .filter((entry) => entry.group === `Transform ${id} variations`)
          .map((entry) => [entry.path.slice(id.length + 1), entry.current]),
      ),
    })),
    // Set only when transforms were left out, together with the real count,
    // so the agent knows to ask for the rest through get_flame.
    truncated: listed.length < transformIds.length ? true : undefined,
    transformCount:
      listed.length < transformIds.length ? transformIds.length : undefined,
    // Easing and interpolation names are not repeated here: they are the
    // enums on arcade_set_keyframes' own input schema.
    limits: {
      frames: MAX_CINEMA_FRAMES,
      tracks: MAX_CINEMA_TRACKS,
      keyframesPerTrack: MAX_CINEMA_KEYFRAMES_PER_TRACK,
      fps: '1-60',
    },
    current: config
      ? {
          fps: config.fps,
          durationFrames: config.endFrame,
          loopMode: config.loopMode ?? 'off',
        }
      : undefined,
  }
}

export const arcadeGetAnimatablePaths: WebMcpTool = {
  name: 'arcade_get_animatable_paths',
  description:
    'List every parameter path the timeline can keyframe for the current flame (render settings, palette, camera, per-transform affine coefficients, probability, colour, variation weights, final transform) with current values and limits. A path with no "type" is a number; transformPaths gives the per-transform grammar; easing and interpolation names are the enums on arcade_set_keyframes.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    return summarize(
      buildAnimatableCatalog(ctx.flameDescriptor()),
      ctx.timeline.edit?.snapshot().config,
    )
  },
}

export const arcadeSetKeyframes: WebMcpTool = {
  name: 'arcade_set_keyframes',
  description:
    'Replace the animation with the given tracks (validated against arcade_get_animatable_paths) and start playing it. fps 1-60, durationFrames 2-1800, loopMode off|seamless|cycle, each track { path, keyframes: [{ frame, value, easing?, interp? }] }. Applied as one undoable, recorded step. Requires an active Cinema session.',
  inputSchema: {
    type: 'object',
    properties: {
      fps: {
        type: 'integer',
        description: 'Frames per second, 1-60 (default 30)',
      },
      durationFrames: { type: 'integer', description: 'Total frames, 2-1800' },
      loopMode: { type: 'string', enum: ['off', 'seamless', 'cycle'] },
      play: {
        type: 'boolean',
        description: 'Start playback after applying (default true)',
      },
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            keyframes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  frame: { type: 'integer' },
                  value: {
                    description:
                      'number, string, or [r,g,b] / [r,g,b,a] for colour paths',
                  },
                  easing: { type: 'string', enum: EASINGS },
                  interp: { type: 'string', enum: INTERPS },
                },
                required: ['frame', 'value'],
              },
            },
          },
          required: ['path', 'keyframes'],
        },
      },
    },
    required: ['durationFrames', 'tracks'],
  },
  execute: (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    const state = drivingState()
    if (!state || state.mode !== 'cinema') {
      return {
        error: 'No active Cinema session. Call arcade_start_cinema first.',
      }
    }
    if (pilotStepsRemaining() <= 0) {
      return {
        error: 'Step budget exhausted. Finish now with arcade_end_cinema.',
      }
    }
    const built = buildTimelineSnapshot(
      input,
      buildAnimatableCatalog(ctx.flameDescriptor()),
    )
    if (!built.ok) return { error: built.error }
    const invalid = preflightReplayCommand('timeline.loadTimeline', [
      built.snapshot,
    ])
    if (invalid) return { error: invalid }
    executeCommand('timeline.loadTimeline', ctx, built.snapshot)
    executeCommand('timeline.setAnimationEnabled', ctx, true)
    // Wall-clock transport, so `timeline.play` is deliberately not replayable
    // and `execute_command` refuses it. The tool starts it here instead: an
    // animation the viewer has to press Play on is not an animation the agent
    // showed them. Suppressed for the recorder the same way the workspace
    // suppresses transport during a take — otherwise every Cinema session
    // would be saved carrying an unnamed write and reported as unfaithful.
    const play = (input as { play?: unknown } | undefined)?.play !== false
    if (play) {
      withRecordingSuppressed(() => {
        executeCommand('timeline.play', ctx)
      })
    }
    const trackCount = built.snapshot.tracks.length
    const remaining = notePilotStep(
      'command',
      `Set ${trackCount} tracks, ${built.keyframeCount} keyframes`,
    )
    return {
      ok: true,
      trackCount,
      keyframeCount: built.keyframeCount,
      durationSeconds: Number(
        (built.snapshot.config.endFrame / built.snapshot.config.fps).toFixed(2),
      ),
      playing: play,
      remaining,
      next: 'Narrate with arcade_narrate, refine by calling this again with all tracks, and finish with arcade_end_cinema.',
    }
  },
}

export const arcadeEndCinema: WebMcpTool = {
  name: 'arcade_end_cinema',
  description:
    "Finish the Cinema session: stops recording, saves the animation session to the user's library, unlocks the editor and shows the replay card. Provide a short title.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'At most 80 characters' },
      summary: { type: 'string', description: 'At most 400 characters' },
    },
  },
  execute: async (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    const state = drivingState()
    if (!state || state.mode !== 'cinema') {
      return { error: 'No active Cinema session.' }
    }
    const raw = (input ?? {}) as { title?: unknown; summary?: unknown }
    const ended = await finishPilot(ctx, 'finished', {
      title: typeof raw.title === 'string' ? raw.title : undefined,
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    })
    if ('error' in ended) return ended
    return {
      ok: true,
      title: ended.title,
      sessionName: ended.sessionName,
      steps: ended.steps,
      durationMs: Math.round(ended.durationMs),
    }
  },
}
