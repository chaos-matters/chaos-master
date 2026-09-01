import { ColorInitMode } from '@/flame/colorInitMode'
import { DrawMode } from '@/flame/drawMode'
import { PointInitMode } from '@/flame/pointInitMode'
import { renderSettingsDefault } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import * as v from '@/valibot'
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
 * Settings whose value is a closed set of names. `typeof value === 'string'`
 * would accept "banana" for a draw mode, which then resolves to an undefined
 * implementation at render time.
 */
const STRING_SETTING_SCHEMAS: Record<string, v.GenericSchema<string>> = {
  drawMode: DrawMode,
  colorInitMode: ColorInitMode,
  pointInitMode: PointInitMode,
}

/**
 * `camera` and `camera3D` are containers, not settings: only their leaves are
 * addressable. Writing one wholesale (or clearing it) is refused, because the
 * renderer reads `camera.position` / `camera.zoom` unconditionally — a `{}`
 * or a missing camera is a crash on the next frame, and both are reachable
 * from a hand-edited `.steps.json`.
 */
function isContainerDefault(expected: unknown): boolean {
  return (
    expected !== null &&
    typeof expected === 'object' &&
    !Array.isArray(expected)
  )
}

/**
 * A value is acceptable when it matches the shape of the default at that
 * path. Replayed args cross a JSON boundary and hand-edited `.steps.json` is
 * an explicitly supported workflow, so this is where a wrong type is stopped
 * rather than written into the document.
 */
function matchesDefaultShape(path: string, expected: unknown, value: unknown) {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(value) &&
      value.length === expected.length &&
      value.every((entry) => Number.isFinite(entry))
    )
  }
  if (typeof expected === 'number') return Number.isFinite(value)
  const enumSchema = STRING_SETTING_SCHEMAS[path]
  if (enumSchema) return v.safeParse(enumSchema, value).success
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
  // "Set gamma", not "Set Render Setting" — the replay step list is only
  // readable if each step says which parameter it moved.
  describe: ([path, value]) =>
    typeof path === 'string'
      ? `Set ${path}${typeof value === 'number' ? ` to ${Number(value.toFixed(3))}` : ''}`
      : undefined,
  execute(ctx, path?: unknown, value?: unknown) {
    if (typeof path !== 'string') {
      console.warn(
        '[cmd] flame.setRenderSetting: rejected non-string path',
        path,
      )
      return
    }

    if (
      path === 'camera3D' &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      ctx.timeline.setPreviewHeld?.(false)
      const currentCamera =
        (defaultAtPath('camera3D') as Record<string, unknown>) ?? {}
      const mergedCamera = {
        ...currentCamera,
        ...(value as Record<string, unknown>),
      }
      ctx.setFlameDescriptor((draft) => {
        if (!draft.renderSettings) {
          draft.renderSettings = deepClone(renderSettingsDefault)
        }
        draft.renderSettings.camera3D = mergedCamera as unknown as NonNullable<
          typeof draft.renderSettings.camera3D
        >
      }, 'Set camera3D')
      return
    }

    if (
      path === 'camera' &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      ctx.timeline.setPreviewHeld?.(false)
      const currentCamera =
        (defaultAtPath('camera') as Record<string, unknown>) ?? {}
      const mergedCamera = {
        ...currentCamera,
        ...(value as Record<string, unknown>),
      }
      ctx.setFlameDescriptor((draft) => {
        if (!draft.renderSettings) {
          draft.renderSettings = deepClone(renderSettingsDefault)
        }
        draft.renderSettings.camera = mergedCamera as unknown as NonNullable<
          typeof draft.renderSettings.camera
        >
      }, 'Set camera')
      return
    }

    const expected = defaultAtPath(path)
    if (expected === undefined || isContainerDefault(expected)) {
      console.warn('[cmd] flame.setRenderSetting: rejected', path, value)
      return
    }
    // `null` clears the setting instead of writing one — the app's own
    // "Auto" background button deletes the key so the theme picks it, and a
    // recorded action needs a way to say that. (undefined arrives as null
    // through the JSON round-trip, so this is the same case.)
    if (value === null) {
      if (path !== 'backgroundColor') {
        console.warn('[cmd] flame.setRenderSetting: rejected clear', path)
        return
      }
      const segments = path.split('.')
      const leaf = segments.pop()
      if (leaf === undefined) return
      ctx.setFlameDescriptor((draft) => {
        let node = draft.renderSettings as unknown as Record<string, unknown>
        for (const segment of segments) {
          const next = node[segment]
          if (next === null || typeof next !== 'object') return
          node = next as Record<string, unknown>
        }
        delete node[leaf]
      }, `Clear ${path}`)
      return
    }
    if (!matchesDefaultShape(path, expected, value)) {
      console.warn('[cmd] flame.setRenderSetting: rejected', path, value)
      return
    }
    // Camera edits take ownership from a held timeline frame. Keep this
    // semantic inside the replayed command rather than only in the live UI
    // setters; otherwise the same recorded pan/zoom can remain hidden behind
    // timeline.previewHeld when played back.
    if (
      path === 'camera.zoom' ||
      path === 'camera.position' ||
      (typeof path === 'string' && path.startsWith('camera3D.'))
    ) {
      ctx.timeline.setPreviewHeld?.(false)
    }
    const segments = (path).split('.')
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
