/**
 * The files a drop carries, from `dataTransfer.files` first and the `items`
 * list as a fallback.
 *
 * Some Chromium builds on Linux (Wayland and X11 file-manager drags) deliver a
 * drop whose `files` list is empty while `items` still holds the entries; a URL
 * or image dragged from another window carries no file at all. Callers get an
 * empty array in that case instead of a crash or a silently ignored drop.
 */
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
