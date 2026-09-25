import { AFFINE_EQUATIONS } from '@/arcade/affineTerms'
import { buildAnimatableCatalog, buildTimelineSnapshot, MAX_CINEMA_FRAMES, MAX_CINEMA_KEYFRAMES_PER_TRACK, MAX_CINEMA_TRACKS, } from '@/arcade/animatablePaths'
import { describeAllowedCommands } from '@/arcade/commandHints'
import { qualityRank } from '@/arcade/guard'
import { clearNarration } from '@/arcade/narration'
import { agentDriving, drivingState, notePilotStep, pilotStepsRemaining, startPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { ALWAYS_ALLOWED, CINEMA_ALLOWED, CINEMA_STEP_BUDGET, PRESENTATION_SWITCHES, } from '@/arcade/topics'
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { captureGlideSwitches } from '@/flame/glide/runtime'
import { withRecordingSuppressed } from '@/recorder/recorder'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { AffineLayout } from '@/arcade/affineTerms'
import type { CatalogEntry } from '@/arcade/animatablePaths'
import type { TimelineTrack } from '@/utils/timeline'
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
    // Enforced, not advertised: the brief is described from `briefed`, and
    // PRESENTATION_SWITCHES says why the switches stay out of it.
    const briefed = [...CINEMA_ALLOWED, ...ALWAYS_ALLOWED]
    const allowed = [...briefed, ...PRESENTATION_SWITCHES]
    const result = startPilot({
      mode: 'cinema',
      title: 'Animating your flame',
      stepBudget: CINEMA_STEP_BUDGET,
      allowed,
      qualityRankAtStart: qualityRank(ctx.arcade.qualityPreset()),
      glideAtStart: captureGlideSwitches(),
    })
    if (!result.ok) {
      ctx.recorder.cancel()
      return { error: result.error }
    }
    clearNarration()
    ctx.arcade.closeHub()
    // Only when it is not already open. Recording a step that changes nothing
    // makes every Cinema take start with a no-op the viewer watches replay.
    if (ctx.view?.showTimeline?.() !== true) {
      executeCommand('view.setShowTimeline', ctx, true)
    }
    const existing = summarizeExisting(ctx.timeline.tracks())
    return {
      ok: true,
      stepBudget: CINEMA_STEP_BUDGET,
      allowedCommands: describeAllowedCommands(briefed),
      existingTracks: existing,
      tips: [
        ...(existing
          ? [
              `The timeline already holds ${existing.count} track(s) running to frame ${existing.endFrame} — this flame arrived with an animation. ${existing.note}`,
            ]
          : []),
        'Call arcade_get_animatable_paths first.',
        'Build the animation one idea at a time: arcade_set_keyframes with mode "add" per group of related tracks, keeping the same durationFrames. Each call is a step the viewer watches land and can replay.',
        'Keep it under 10 seconds unless asked; use easeInOut for camera moves.',
        'arcade_get_animatable_paths is free; every arcade_set_keyframes call that is accepted costs a step, play or no play, and leaves its tracks behind. A rejected call costs nothing.',
      ],
    }
  },
}

/** How many transforms get their variation weights listed before the result
 *  would blow the ~1.5 KB tool-result budget. */
const MAX_LISTED_TRANSFORMS = 8

/**
 * The transform grammar, stated once for every transform. `layout` is the one
 * most of the flame's affines are in, and the grammar gives its equation
 * first; a transform in the other layout says so in its own `affine` field.
 * The same letter is a different term in each layout (`d` is y-from-x in 2D,
 * the x translation in 3D), and the final transform is described in its own.
 */
function transformPathsGrammar(
  layout: AffineLayout,
  otherLayoutUsed: boolean,
  finalLayout: AffineLayout,
): string {
  const other: AffineLayout = layout === '3D' ? '2D' : '3D'
  const terms = otherLayoutUsed
    ? `${AFFINE_EQUATIONS[layout]}; where a transform says affine "${other}": ${AFFINE_EQUATIONS[other]}`
    : AFFINE_EQUATIONS[layout]
  const finalKeys = finalLayout === '3D' ? '{a-l}' : '{a-f}'
  let final = `${finalKeys}, same terms`
  if (finalLayout !== layout) {
    final = otherLayoutUsed
      ? `${finalKeys}, the "${other}" terms`
      : AFFINE_EQUATIONS[finalLayout]
  }
  return `transform.<id>.{preAffine|postAffine}.${terms} | transform.<id>.{probability|colorSpeed|color.x|color.y} | finalTransform.${final} | <id>.<variationId> = variation weight (no transform. prefix)`
}

/** The layout of one catalogued affine: it lists `g` only in the 3D layout. */
function catalogLayout(
  byPath: ReadonlySet<string>,
  prefix: string,
): AffineLayout {
  return byPath.has(`${prefix}.g`) ? '3D' : '2D'
}

/**
 * The layout most of the listed affines are in, so the fewest transforms need
 * an `affine` note. A tie goes to the layout the flame renders in: 3D exactly
 * when the catalog offers the 3D camera.
 */
function majorityLayout(
  paths: ReadonlySet<string>,
  ids: readonly string[],
): AffineLayout {
  let balance = 0
  for (const id of ids) {
    for (const matrix of ['preAffine', 'postAffine']) {
      balance +=
        catalogLayout(paths, `transform.${id}.${matrix}`) === '3D' ? 1 : -1
    }
  }
  if (balance !== 0) return balance > 0 ? '3D' : '2D'
  return paths.has('camera3D.radius') ? '3D' : '2D'
}

/** Groups `summarize` names explicitly. Everything else lands in `other`. */
const NAMED_GROUPS = new Set([
  'Render',
  'Palette',
  'Color',
  'Camera',
  'Camera3D',
])

/** How many existing track paths are named before the list is truncated. */
const MAX_LISTED_EXISTING = 12

/**
 * What the timeline already holds, so a Cinema call can be built around it.
 *
 * A flame opened from a motion row arrives with its own animation on the
 * timeline. An agent that cannot see it sends `mode: "add"` with a shorter
 * duration, gets the (correct) refusal naming a track it never placed, and has
 * to guess what happened — the run this came from blamed the keyframes' missing
 * `interp`, which is optional and was never the problem.
 */
function summarizeExisting(tracks: readonly TimelineTrack[]) {
  if (tracks.length === 0) return undefined
  const endFrame = Math.max(
    ...tracks.map((track) => track.keyframes.at(-1)?.frame ?? 0),
  )
  return {
    count: tracks.length,
    endFrame,
    paths: tracks.slice(0, MAX_LISTED_EXISTING).map((t) => t.parameterPath),
    truncated: tracks.length > MAX_LISTED_EXISTING ? true : undefined,
    note: `mode "add" keeps these and needs durationFrames >= ${endFrame}; "replace" drops them; timeline.clearTracks empties the timeline.`,
  }
}

function summarize(
  catalog: CatalogEntry[],
  config: { fps: number; endFrame: number; loopMode?: string } | undefined,
  existingTracks: readonly TimelineTrack[] = [],
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
  const paths = new Set(catalog.map((entry) => entry.path))
  const layout = majorityLayout(paths, listed)
  /** How a transform's affines differ from the flame's layout, if they do. */
  const affineNote = (id: string) => {
    const differing = (['preAffine', 'postAffine'] as const).filter(
      (matrix) => catalogLayout(paths, `transform.${id}.${matrix}`) !== layout,
    )
    const other = layout === '3D' ? '2D' : '3D'
    if (differing.length === 0) return undefined
    return differing.length === 2 ? other : `${differing[0]} ${other}`
  }
  const otherLayoutUsed = transformIds.some(
    (id) => affineNote(id) !== undefined,
  )
  return {
    render: simple('Render'),
    palette: simple('Palette'),
    color: simple('Color'),
    // A flame renders through exactly one camera family and the catalog drops
    // the other, so this key always holds the live one — camera3D.* on a 3D
    // flame. Naming only the 2D group here is what reported `camera: []` for a
    // 3D flame whose camera3D paths were keyable all along.
    camera: [...simple('Camera'), ...simple('Camera3D')],
    // Everything else the timeline drives, collected by exclusion so a new
    // parameter group cannot go missing the way Camera3D did. Transforms have
    // their own block below, and `transformPaths` already gives the
    // finalTransform grammar — its current values are a get_flame away and
    // would cost more of the result than they are worth here.
    other: catalog
      .filter(
        (entry) =>
          !NAMED_GROUPS.has(entry.group) &&
          entry.group !== 'Final Transform' &&
          !entry.group.startsWith('Transform '),
      )
      .map((entry) => ({
        path: entry.path,
        type: entry.type === 'number' ? undefined : entry.type,
        current: entry.current,
      })),
    transformPaths: transformPathsGrammar(
      layout,
      otherLayoutUsed,
      catalogLayout(paths, 'finalTransform'),
    ),
    transforms: listed.map((id) => ({
      id,
      affine: affineNote(id),
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
    existingTracks: summarizeExisting(existingTracks),
  }
}

export const arcadeGetAnimatablePaths: WebMcpTool = {
  name: 'arcade_get_animatable_paths',
  description:
    'List every parameter path the timeline can keyframe for the current flame (render settings, palette, camera, per-transform affine terms, each affine in its own layout (a-f in 2D, a-l in 3D), probability, colour, variation weights, final transform) with current values and limits. A path with no "type" is a number; transformPaths gives the per-transform grammar and what each affine term is; easing and interpolation names are the enums on arcade_set_keyframes.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    return summarize(
      buildAnimatableCatalog(ctx.flameDescriptor()),
      ctx.timeline.edit?.snapshot().config,
      ctx.timeline.tracks(),
    )
  },
}

export const arcadeSetKeyframes: WebMcpTool = {
  name: 'arcade_set_keyframes',
  description:
    'Apply animation tracks (validated against arcade_get_animatable_paths) and play them once. mode "add" keeps the tracks already placed, "replace" (default) discards them. Prefer one call per idea: each is a recorded step the viewer watches land. fps 1-60, durationFrames 2-1800, track { path, keyframes: [{ frame, value, easing?, interp? }] }. Needs an active Cinema session.',
  inputSchema: {
    type: 'object',
    properties: {
      fps: {
        type: 'integer',
        description: 'Frames per second, 1-60 (default 30)',
      },
      durationFrames: { type: 'integer', description: 'Total frames, 2-1800' },
      loopMode: { type: 'string', enum: ['off', 'seamless', 'cycle'] },
      mode: {
        type: 'string',
        enum: ['replace', 'add'],
        description:
          'add = merge with the tracks already placed (same path wins from this call); replace = start over (default)',
      },
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
      ctx.timeline.tracks(),
    )
    if (!built.ok) return { error: built.error }
    const invalid = preflightReplayCommand('timeline.loadTimeline', [
      built.snapshot,
    ])
    if (invalid) return { error: invalid }
    // One tool call, one recorded action. The snapshot carries
    // `animationEnabled: true` and `load` applies it (MainWorkspace's timeline
    // edit context), so a `timeline.setAnimationEnabled` on the next line only
    // re-set what the line above had already set — and cost the take a second
    // action the rail never mentioned, which replayed as its own step with its
    // own dwell and its own spotlight on a toggle that never moved.
    executeCommand('timeline.loadTimeline', ctx, built.snapshot)
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
      next: 'Narrate with arcade_narrate, add the next idea with mode "add", and finish with arcade_end_cinema.',
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
