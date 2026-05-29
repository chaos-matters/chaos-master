export interface ParsedShortcut {
  ctrl: boolean
  shift: boolean
  key: string
}

export function parseShortcut(shortcut: string): ParsedShortcut | null {
  const parts = shortcut.split('+')
  if (parts.length < 2) return null

  let ctrl = false
  let shift = false

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!part) return null
    const p = part.toLowerCase()
    if (p === 'ctrl' || p === 'cmd' || p === 'meta') {
      ctrl = true
    } else if (p === 'shift') {
      shift = true
    } else {
      return null
    }
  }

  const lastPart = parts[parts.length - 1]
  if (!lastPart) return null
  const key = lastPart.toLowerCase()
  if (!key) return null

  return { ctrl, shift, key }
}

export function matchesShortcut(
  ev: KeyboardEvent,
  parsed: ParsedShortcut,
): boolean {
  const ctrlPressed = ev.ctrlKey || ev.metaKey
  if (parsed.ctrl !== ctrlPressed) return false
  if (parsed.shift !== ev.shiftKey) return false
  if (ev.key.toLowerCase() !== parsed.key) return false
  return true
}
