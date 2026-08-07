import { renderSettingsDefault } from '@/flame/schema/flameSchema'
import { registerCommand } from '../registry'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * One command for every scalar render setting, addressed by the same
 * parameter-path vocabulary the timeline keyframes use (`gamma`, `exposure`,
 * `paletteSpeed`, …) and that the sliders already carry as
 * `data-parameter-path`.
 *
 * Twenty-odd near-identical `flame.setX` commands would say nothing extra: for
 * render settings the path IS the intent, it is already the app's shared name
 * for the parameter, and one command means a new setting needs no new command
 * to become recordable. Structural edits keep their own named commands, where
 * the intent is more than "this field took this value".
 */

type RenderSettings = FlameDescriptor['renderSettings']

/** The legal vocabulary: keys of the schema defaults rather than of the live
 *  document, so an optional setting the current flame happens to omit is
 *  still settable. */
function isRenderSettingPath(path: unknown): path is keyof RenderSettings {
  return typeof path === 'string' && path in renderSettingsDefault
}

/**
 * A value is acceptable when it matches the shape of the default for that
 * path. Replayed args cross a JSON boundary and hand-edited `.steps.json` is
 * an explicitly supported workflow, so this is where a wrong type is stopped
 * rather than written into the document.
 */
function matchesDefaultShape(path: keyof RenderSettings, value: unknown) {
  const expected = renderSettingsDefault[path]
  if (Array.isArray(expected)) {
    return (
      Array.isArray(value) &&
      value.length === expected.length &&
      value.every((entry) => typeof entry === 'number')
    )
  }
  return typeof value === typeof expected
}

registerCommand({
  id: 'flame.setRenderSetting',
  label: 'Set Render Setting',
  description:
    'Set a render setting by its parameter path (gamma, exposure, paletteSpeed, …)',
  // A drag re-fires onInput for the whole gesture; all of it is one undo step
  // live, so it is one action in the log too.
  coalesceKey: ([path]) => (typeof path === 'string' ? path : undefined),
  execute(ctx, path?: unknown, value?: unknown) {
    if (!isRenderSettingPath(path) || !matchesDefaultShape(path, value)) {
      console.warn('[cmd] flame.setRenderSetting: rejected', path, value)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      // Shapes are checked above; the descriptor's per-key union cannot be
      // expressed through a dynamic key.
      ;(draft.renderSettings as Record<string, unknown>)[path] = value
    }, `Set ${path}`)
  },
})
