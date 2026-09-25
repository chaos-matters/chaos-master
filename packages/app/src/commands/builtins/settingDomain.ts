/**
 * The domain a command holds a render setting to is the flame schema's own
 * (numberDomain.ts): an integer setting is floored, a bounded one clamped at
 * both ends, and palettePhase, the cyclic one, wrapped. Clamped, not refused,
 * because that is what the commands that write numbers already did: the
 * camera verbs clamp to the schema's zoom range and `flame.setBlendWeight` to
 * [0, 1]. A value of the wrong type is still refused by the command itself.
 *
 * Each command calls this twice. In `normalizeArgs`, so a take records the
 * value that landed rather than the one that was asked for, and an agent's
 * preflight checks that value. In `execute` again, because a replayed take
 * reaches it without normalizing; the projection leaves a projected value as
 * it is.
 */
import { projectFlameValue } from '@chaos-master/core'
import { deepClone } from '@/utils/clone'
import type { CommandContext } from '../types'

/** `value` held to the domain the schema gives render setting `path`, a
 *  dotted path as `flame.setRenderSetting` takes it. */
export function projectRenderSetting(
  ctx: CommandContext,
  path: string,
  value: unknown,
): unknown {
  // Objects are projected in place, and this one belongs to the caller.
  const own =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? deepClone(value)
      : value
  return projectFlameValue(
    ['renderSettings', ...path.split('.')],
    own,
    dimensionsOf(ctx),
  )
}

/** A number held to setting `path`'s domain, or `fallback` for anything that
 *  is not a finite number. */
export function heldSetting(
  ctx: CommandContext,
  path: string,
  value: unknown,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? (projectRenderSetting(ctx, path, value) as number)
    : fallback
}

/** `normalizeArgs` for a command whose first argument is setting `path`. */
export function heldFirstArg(path: string) {
  return (ctx: CommandContext, args: unknown[]): unknown[] =>
    args.map((arg, index) =>
      index === 0 ? projectRenderSetting(ctx, path, arg) : arg,
    )
}

/** Read defensively: a context assembled without a flame is 2D. */
function dimensionsOf(ctx: CommandContext): unknown {
  const read = ctx.flameDescriptor as
    | CommandContext['flameDescriptor']
    | undefined
  return read?.().renderSettings.dimensions
}
