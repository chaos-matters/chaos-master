import { describeAllowedCommands, SAMPLE_VARIATION_TYPES, } from '@/arcade/commandHints'
import { qualityRank } from '@/arcade/guard'
import { clearNarration, narration } from '@/arcade/narration'
import { agentDriving, drivingState, notePilotStep, pilot, pilotElapsedMs, pilotStepsRemaining, startPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { ALWAYS_ALLOWED, BLANK_CANVAS_STEPS, isTopicId, LESSON_TOPICS, TOPIC_IDS, } from '@/arcade/topics'
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}

export const arcadeStatus: WebMcpTool = {
  name: 'arcade_status',
  description:
    'Read the Arcade session state: phase (idle, driving, ended), mode, topic, steps used and remaining, elapsed time, whether the editor is locked, whether a recording is active, and the last narration. Call it when unsure what to do next.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const ctx = getWebMcpContext()
    const state = pilot()
    const driving = state.phase === 'driving' ? state : undefined
    return {
      phase: state.phase,
      mode: state.phase === 'idle' ? undefined : state.mode,
      topic: state.phase === 'idle' ? undefined : state.topic,
      title: state.phase === 'idle' ? undefined : state.title,
      steps: driving?.steps ?? (state.phase === 'ended' ? state.steps : 0),
      stepBudget: driving?.stepBudget,
      remaining: pilotStepsRemaining(),
      elapsedMs: Math.round(pilotElapsedMs()),
      locked: agentDriving(),
      recorderActive: ctx?.recorder?.isRecording() ?? false,
      narration: narration(),
      // The brief is sent once and a client that truncates it cannot ask for
      // it again: a second arcade_start_lesson is refused as already active.
      // The goal is the half worth re-reading and costs ~240 chars; the
      // allow-list is the half that caused the truncation and belongs in
      // list_commands.
      goal:
        state.phase !== 'idle' && isTopicId(state.topic)
          ? LESSON_TOPICS[state.topic].goal
          : undefined,
      lastEnd:
        state.phase === 'ended'
          ? { reason: state.reason, sessionName: state.sessionName }
          : undefined,
    }
  },
}

export const arcadeStartLesson: WebMcpTool = {
  name: 'arcade_start_lesson',
  description:
    'Start a Teach session: locks the editor, starts recording, and returns the lesson brief (goal, allowed commands with their argument shapes, step budget). Topics: variations, affine, color, camera, genetics, sonification, render. Then use arcade_narrate and execute_command, and finish with arcade_end_lesson.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', enum: TOPIC_IDS, description: 'Lesson topic' },
      startFrom: {
        type: 'string',
        enum: ['blank', 'current'],
        description:
          'Start from a blank canvas or the current flame (default depends on the topic)',
      },
    },
    required: ['topic'],
  },
  execute: (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.recorder || !ctx.arcade) {
      return { error: 'This workspace cannot record sessions.' }
    }
    const raw = (input ?? {}) as { topic?: unknown; startFrom?: unknown }
    if (!isTopicId(raw.topic)) {
      return { error: `Unknown topic. Choose one of: ${TOPIC_IDS.join(', ')}` }
    }
    const topic = LESSON_TOPICS[raw.topic]
    const startFrom =
      raw.startFrom === 'blank' || raw.startFrom === 'current'
        ? raw.startFrom
        : topic.defaultStartFrom
    if (agentDriving()) {
      return {
        error: 'An Arcade session is already active. Finish or stop it first.',
      }
    }
    if (ctx.recorder.isRecording()) {
      return {
        error:
          'A recording is already running. Ask the user to stop it, then call arcade_start_lesson again.',
      }
    }
    const started = ctx.recorder.start()
    if (!started.ok) {
      return { error: `Could not start recording: ${started.reason}` }
    }
    const allowed = [...topic.allowed, ...ALWAYS_ALLOWED]
    const pilotResult = startPilot({
      mode: 'teach',
      topic: topic.id,
      title: `Teaching: ${topic.title}`,
      stepBudget: topic.stepBudget,
      allowed,
      qualityRankAtStart: qualityRank(ctx.arcade.qualityPreset()),
    })
    if (!pilotResult.ok) {
      ctx.recorder.cancel()
      return { error: pilotResult.error }
    }
    clearNarration()
    ctx.arcade.closeHub()
    executeCommand('sidebar.open', ctx, true)
    if (startFrom === 'blank') {
      for (const [id, ...args] of BLANK_CANVAS_STEPS) {
        executeCommand(id, ctx, ...args)
      }
    }
    const usesVariationTypes = allowed.some(
      (id) => id === 'flame.addTransform' || id === 'flame.addVariation',
    )
    return {
      ok: true,
      topic: topic.id,
      goal: topic.goal,
      startFrom,
      allowedCommands: describeAllowedCommands(allowed),
      variationTypes: usesVariationTypes ? SAMPLE_VARIATION_TYPES : undefined,
      stepBudget: topic.stepBudget,
      tips: [
        'Narrate before each group; args must match the shapes exactly.',
        'Check with get_flame; finish with arcade_end_lesson.',
      ],
    }
  },
}

export const arcadeNarrate: WebMcpTool = {
  name: 'arcade_narrate',
  description:
    'Say one sentence to the viewer about the step you are about to take. Shown live and recorded as a caption in the replay. Counts as one step of the budget. Only valid while an Arcade session is active.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'One sentence, at most 400 characters',
      },
    },
    required: ['text'],
  },
  execute: (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    const state = drivingState()
    if (!state) {
      return {
        error:
          'No active Arcade session. Call arcade_start_lesson or arcade_start_cinema first.',
      }
    }
    const text =
      typeof (input as { text?: unknown })?.text === 'string'
        ? (input as { text: string }).text.trim()
        : ''
    if (pilotStepsRemaining() <= 0) {
      return {
        error:
          'Step budget exhausted. Finish now with arcade_end_lesson or arcade_end_cinema.',
      }
    }
    const invalid = preflightReplayCommand('lesson.note', [text])
    if (invalid) return { error: invalid }
    executeCommand('lesson.note', ctx, text)
    const remaining = notePilotStep('narrate', text)
    return { ok: true, steps: state.steps + 1, remaining }
  },
}

export const arcadeEndLesson: WebMcpTool = {
  name: 'arcade_end_lesson',
  description:
    "Finish the Teach session: stops recording, saves the lesson to the user's library, unlocks the editor and shows the replay card. Provide a short title and a one-sentence summary.",
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
    if (!state || state.mode !== 'teach') return { error: 'No active lesson.' }
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
      replayHint:
        'The user can now replay the lesson from the end card or the Arcade library.',
    }
  },
}
