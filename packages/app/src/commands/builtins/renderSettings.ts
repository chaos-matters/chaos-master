import { renderSettingsDefault } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'

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

/**
 * Resolve a dotted path against the schema defaults — the legal vocabulary.
 * Nested because the camera lives at `camera.zoom` / `camera3D.theta`, and
 * reading the shape from the DEFAULTS rather than the live document means an
 * optional setting the current flame happens to omit is still settable.
 * Returns the default value at that path, or undefined when the path is not
 * part of the vocabulary.
 */
function defaultAtPath(path: unknown): unknown {
  if (typeof path !== 'string' || path === '') return undefined
  let node: unknown = renderSettingsDefault
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      return undefined
    }
    if (!(segment in node)) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

/**
 * A value is acceptable when it matches the shape of the default at that
 * path. Replayed args cross a JSON boundary and hand-edited `.steps.json` is
 * an explicitly supported workflow, so this is where a wrong type is stopped
 * rather than written into the document.
 */
function matchesDefaultShape(expected: unknown, value: unknown) {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(value) &&
      value.length === expected.length &&
      value.every((entry) => Number.isFinite(entry))
    )
  }
  if (typeof expected === 'number') return Number.isFinite(value)
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
    const expected = defaultAtPath(path)
    if (expected === undefined || !matchesDefaultShape(expected, value)) {
      console.warn('[cmd] flame.setRenderSetting: rejected', path, value)
      return
    }
    const segments = (path as string).split('.')
    const leaf = segments.pop()
    if (leaf === undefined) return
    ctx.setFlameDescriptor((draft) => {
      // Shapes are checked above; the descriptor's per-key unions cannot be
      // expressed through dynamic keys.
      let node = draft.renderSettings as unknown as Record<string, unknown>
      const walked: string[] = []
      for (const segment of segments) {
        walked.push(segment)
        const next = node[segment]
        // A nested container the flame omits (camera3D on a 2D flame) is
        // created from its defaults rather than silently dropping the write.
        // Looked up by the walked prefix, not the bare segment, so this stays
        // correct if the vocabulary ever nests deeper than camera.zoom.
        if (next === null || typeof next !== 'object') {
          node[segment] = deepClone(defaultAtPath(walked.join('.')))
        }
        node = node[segment] as Record<string, unknown>
      }
      node[leaf] = value
    }, `Set ${path}`)
  },
})
