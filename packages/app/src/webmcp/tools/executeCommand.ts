import { duelActive, duelRemainingMs } from '@/arcade/duel'
import { guardCommand } from '@/arcade/guard'
import { appendPilotLog, drivingState, notePilotStep, pilotStepsRemaining, } from '@/arcade/pilot'
import { budgetExhaustedMessage } from '@/arcade/pilotActions'
import { notePilotFocus } from '@/arcade/pilotFocus'
import { executeCommand, getCommand, preflightLiveCommand, } from '@/commands/registry'
import { clampGlideMs } from '@/flame/glide/durations'
import { isGlideQualityPreference } from '@/flame/glide/quality'
import { getGlideRuntime, glideEnabled } from '@/flame/glide/runtime'
import { MAX_GLIDE_MS } from '@/flame/glide/types'
import { focusForCommand } from '@/recorder/focus'
import { NARRATION_COMMAND_ID } from '@/recorder/narrationMode'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { GlideOptions, GlideOutcome } from '@/flame/glide/types'
import type { WebMcpTool } from '@/webmcp/types'

/**
 * One readable line for the pilot overlay's live step list.
 *
 * The same sentence the recorder writes into the log, so the live rail and the
 * replay's step list say the same thing about the same step. Commands that
 * render their value into their own label ("Sonification model: ambient") are
 * why: appending raw JSON instead produced "Set Sonification Sound
 * [{"version":1,"model":"ambient",...]" live and the readable form only on
 * replay, which made the two views look like different sessions.
 *
 * The argument dump survives only as the fallback for commands that describe
 * nothing, where the values are the only thing distinguishing two steps.
 */
function describeStep(commandId: string, args: unknown[]): string {
  const cmd = getCommand(commandId)
  // A describe reads args it did not validate. One that throws here would
  // fail the tool call AFTER the command already mutated the document, so the
  // agent would see an error for a step the viewer just watched land.
  let described: string | undefined
  try {
    described = cmd?.describe?.([...args])
  } catch {
    described = undefined
  }
  if (described !== undefined && described !== '') return described
  const label = cmd?.label ?? commandId
  let rendered = ''
  try {
    rendered = JSON.stringify(args)
  } catch {
    rendered = ''
  }
  if (rendered === '' || rendered === '[]') return label
  return rendered.length > 80
    ? `${label} ${rendered.slice(0, 77)}...`
    : `${label} ${rendered}`
}

export const executeCommandTool: WebMcpTool = {
  name: 'execute_command',
  description:
    'Execute any registered command by ID. Use list_commands to discover available commands. Arguments are passed as an array. Commands are validated before execution for safety. This is an escape hatch for advanced use.',
  inputSchema: {
    type: 'object',
    properties: {
      commandId: {
        type: 'string',
        description: "The command ID to execute, e.g. 'flame.setExposure'",
      },
      args: {
        type: 'array',
        items: {},
        description: 'Arguments array for the command',
      },
      glideMs: {
        type: 'number',
        description: `Animate the change instead of snapping to it: how long the transition should take, in milliseconds (0 turns it off, up to ${MAX_GLIDE_MS}). Omit to follow the workspace setting. Presentation only — it is not part of what the command did, so it is never recorded.`,
      },
      glideQuality: {
        type: 'string',
        enum: ['auto', 'responsive', 'balanced', 'full'],
        description:
          'How much render quality the transition gives up while it moves. "responsive" is fastest, "full" does not downshift at all so each frame takes longer, "auto" follows the render quality preset. It always settles at full quality.',
      },
    },
    required: ['commandId'],
  },
  async execute(input: unknown) {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    const rawInput =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : undefined

    if (
      !rawInput ||
      typeof rawInput.commandId !== 'string' ||
      rawInput.commandId.trim().length === 0
    ) {
      return {
        error: 'Invalid input: "commandId" string property is required.',
      }
    }

    const commandId = rawInput.commandId
    const args = Array.isArray(rawInput.args) ? rawInput.args : []

    // While an Arcade pilot drives, the mode's allow-list and the step budget
    // apply before anything else: an agent must not be able to reach export,
    // history or a quality bump through the generic escape hatch.
    const driving = drivingState()
    if (driving) {
      const blocked = guardCommand(commandId, args, driving)
      if (blocked !== undefined) {
        appendPilotLog('error', blocked)
        return { error: blocked }
      }
      if (pilotStepsRemaining() <= 0) {
        return { error: budgetExhaustedMessage(driving.mode) }
      }
      // The clock is a limit like the budget is. `startDuel` schedules the
      // ending, but a background tab throttles timers, so this is what stops
      // an agent from editing on past zero while that timer waits its turn.
      if (duelActive() && duelRemainingMs() <= 0) {
        return {
          error:
            'Time is up. The duel is ending; your flame is as you left it.',
        }
      }
    }

    // Checked against the args that will be RECORDED, not the ones the agent
    // typed: `preflightLiveCommand` normalizes first, so a command that mints
    // its own seed or expands a boolean into a snapshot is reachable.
    const preflight = preflightLiveCommand(commandId, ctx, args)
    if ('error' in preflight) {
      return { error: preflight.error }
    }

    // A glide is PRESENTATION, so it never enters `args`: the recorder stamps
    // `{commandId, args}`, and how long the change took to appear is not part
    // of what the person did.
    //
    // Under the duel clock it is switched off outright. The clock is
    // wall-clock, so a pilot spending five seconds of it on animation would be
    // buying time rather than flying.
    const glide = resolveGlideRequest(rawInput, driving !== undefined)
    const runtime = getGlideRuntime()
    // Settle anything already in flight FIRST, whether or not THIS call
    // animates: a scripted command is a change, so the transition before it
    // belongs to the change before it and must land on its own target rather
    // than be cancelled halfway. `settleForNextChange` hands back what the
    // viewer can see, so an animation that follows starts from there.
    const visible = runtime?.settleForNextChange()
    const glideFrom =
      glide === undefined
        ? undefined
        : deepClone(visible ?? ctx.flameDescriptor())

    try {
      // Live dispatch: recorded by the session recorder, args normalised, and
      // `beforeCommand` hands any paused replay back first. The replay path
      // (`executeReplayCommand`) skips all three, which is right for a
      // .steps.json file and wrong for an agent driving the editor.
      executeCommand(commandId, ctx, ...args)
    } catch (e) {
      return {
        error: `Command failed: ${e instanceof Error ? e.message : String(e)}`,
      }
    }

    // What the command has to say about itself now that it has run. Only the
    // few that queue work declare one (see `FlameCommand.report`); a report
    // that throws must not turn a step the viewer just watched land into a
    // failed tool call, so it is swallowed exactly like `describe` is.
    // Awaited, and bounded by MAX_GLIDE_MS, so an agent firing twenty commands
    // does not stack twenty transitions on top of each other.
    // Bounded by the runtime's own wall-clock deadline as well as by
    // MAX_GLIDE_MS: `requestAnimationFrame` does not run in a tab that is not
    // visible, and an agent driving a hidden tab would otherwise hold this
    // call until somebody looked at the browser again.
    const outcome =
      runtime !== undefined && glideFrom !== undefined
        ? await runtime.glideFrom(glideFrom, glide ?? {})
        : undefined

    let result: unknown
    try {
      result = getCommand(commandId)?.report?.(ctx, ...preflight.args)
    } catch {
      result = undefined
    }
    const reported = result === undefined ? {} : { result }

    if (driving) {
      // The NORMALIZED args, which are the ones the recorder describes and
      // logs. A command whose label renders its value reads them back out of
      // its canonical shape — `sonification.setConfig` cannot say
      // "Sonification model: ambient" from the flat config an agent typed,
      // only from the snapshot normalization builds.
      const line = describeStep(commandId, preflight.args)
      const remaining = notePilotStep('command', line)
      // Point the overlay at the control this step moved. Same hint the
      // recorder stamps on the action, resolved the same way, so the live
      // spotlight and the replay follow-cam cannot pick different targets for
      // the same command.
      //
      // Narration is the exception: a sentence is the agent SPEAKING about
      // what it just did, not a move on the interface. Retiring the ring for
      // it would pull the pointer off the control the sentence is explaining.
      if (commandId !== NARRATION_COMMAND_ID) {
        const cmd = getCommand(commandId)
        const args = [...preflight.args]
        notePilotFocus(
          {
            t: 0,
            id: commandId,
            args,
            focus: cmd === undefined ? undefined : focusForCommand(cmd, args),
          },
          line,
        )
      }
      return {
        success: true,
        commandId,
        steps: driving.steps + 1,
        remaining,
        ...reported,
      }
    }

    return { success: true, commandId, ...reported, ...glideReport(outcome) }
  },
}

/**
 * What the caller is told about the transition, which is nothing at all in the
 * ordinary case.
 *
 * Only a glide the DEADLINE landed is worth a word. The document is on exactly
 * the target either way; this says nobody watched it get there, which is what
 * a tab with no `requestAnimationFrame` looks like and what an agent composing
 * a demo or a recording needs to know. The Arcade path never reaches it — a
 * duel turns glides off outright, so there is no outcome to report.
 */
function glideReport(outcome: GlideOutcome | undefined) {
  return outcome?.completedByDeadline === true
    ? { glide: { completedBy: 'deadline' } }
    : {}
}

/**
 * The glide this call asked for, or `undefined` when nothing should animate.
 *
 * An explicit `glideMs` wins in both directions — `0` turns a glide off even
 * with the workspace setting on — and omitting it follows the setting and
 * lets the planner read the change itself.
 */
function resolveGlideRequest(
  input: Record<string, unknown>,
  duelling: boolean,
): GlideOptions | undefined {
  if (duelling) return undefined
  const quality = isGlideQualityPreference(input.glideQuality)
    ? input.glideQuality
    : undefined
  const requested = input.glideMs
  if (typeof requested === 'number' && Number.isFinite(requested)) {
    const durationMs = clampGlideMs(requested)
    if (durationMs <= 0) return undefined
    return { durationMs, ...(quality === undefined ? {} : { quality }) }
  }
  if (!glideEnabled()) return undefined
  return quality === undefined ? {} : { quality }
}
