import type { PilotState } from './pilot'

/** Order of `components/Quality/QualityPresets.tsx` keys, lowest first. */
export const QUALITY_ORDER = ['low', 'mid', 'high', 'ultra'] as const

export function qualityRank(key: unknown): number {
  return typeof key === 'string'
    ? (QUALITY_ORDER as readonly string[]).indexOf(key)
    : -1
}

export function isCommandAllowed(
  commandId: string,
  allowed: readonly string[],
): boolean {
  return allowed.some((entry) =>
    entry.endsWith('.') ? commandId.startsWith(entry) : entry === commandId,
  )
}

const BLOCKED_PREFIXES = ['export.', 'history.'] as const
const LOCKED_RENDER_SETTING = /pointcount|dimensions|quality|resolution/i

/**
 * Pure policy for one agent-issued command. Returns the reason to refuse, or
 * undefined to let it through. Only applies while a pilot is driving: outside
 * an Arcade session the human is in charge and nothing is restricted.
 */
export function guardCommand(
  commandId: string,
  args: readonly unknown[],
  state: PilotState,
): string | undefined {
  if (state.phase !== 'driving') return undefined
  if (BLOCKED_PREFIXES.some((prefix) => commandId.startsWith(prefix))) {
    return `${commandId} is not available while the agent drives`
  }
  if (!isCommandAllowed(commandId, state.allowed)) {
    const scope = state.topic ? `${state.mode}/${state.topic}` : state.mode
    return `${commandId} is not allowed in ${scope}. Allowed: ${state.allowed.join(', ')}`
  }
  // Looping playback is the one transport setting that keeps the GPU busy
  // indefinitely, and an agent has no way to see that it is happening: it
  // would leave the animation running for the whole time it spends composing
  // the next call. The viewer turns it on themselves afterwards.
  if (commandId === 'timeline.setLoop' && args[0] !== false) {
    return 'Looping playback stays off while the agent drives; the viewer can turn it on afterwards'
  }
  if (commandId === 'view.setQualityPreset') {
    const rank = qualityRank(args[0])
    if (rank < 0 || rank > state.qualityRankAtStart) {
      const cap =
        QUALITY_ORDER[state.qualityRankAtStart] ?? 'the starting preset'
      return `Quality can only stay at or below "${cap}" while the agent drives`
    }
  }
  if (
    commandId === 'flame.setRenderSetting' &&
    typeof args[0] === 'string' &&
    LOCKED_RENDER_SETTING.test(args[0])
  ) {
    return `Render setting "${args[0]}" is locked while the agent drives`
  }
  if (
    commandId === 'flame.updateRenderSettings' &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    Object.keys(args[0]).some((key) => LOCKED_RENDER_SETTING.test(key))
  ) {
    return 'Point count, dimensions and quality are locked while the agent drives'
  }
  return undefined
}
