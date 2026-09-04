/**
 * The files a drop carries, from `dataTransfer.files` first and the `items`
 * list as a fallback.
 *
 * Some Chromium builds on Linux (Wayland and X11 file-manager drags) deliver a
 * drop whose `files` list is empty while `items` still holds the entries; a URL
 * or image dragged from another window carries no file at all. Callers get an
 * empty array in that case instead of a crash or a silently ignored drop.
 */
/**
 * What to tell someone whose drop arrived with nothing in it.
 *
 * `types: []` is not a rejected file — the browser was handed an empty drag
 * and the file never reached the page at all, so nothing about the file is at
 * fault. A file manager on Wayland or X11 that loses the payload mid-drag is
 * the usual cause, and the picker does not go through drag at all, so it is
 * the way out rather than a workaround.
 */
export const EMPTY_DROP_MESSAGE =
  'That drop arrived empty — no file came with it. The file is probably fine: open Load Flame and pick it instead.'

export function filesFromDataTransfer(
  dt: DataTransfer | null | undefined,
): File[] {
  if (!dt) return []
  const out: File[] = []
  const files = dt.files
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i)
      if (file) out.push(file)
    }
  }
  if (out.length > 0) return out
  const items = dt.items
  if (!items) return out
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item && item.kind === 'file') {
      const file = item.getAsFile()
      if (file) out.push(file)
    }
  }
  return out
}
