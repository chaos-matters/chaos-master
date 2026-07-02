import { describe, expect, it } from 'vitest'
import { matchesShortcut, parseShortcut } from './shortcutParser'

function keyEvent(init: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  })
}

describe('parseShortcut', () => {
  it('parses a plain Ctrl+key shortcut', () => {
    expect(parseShortcut('Ctrl+S')).toEqual({
      ctrl: true,
      shift: false,
      key: 's',
    })
  })

  it('parses Ctrl+Shift+key', () => {
    expect(parseShortcut('Ctrl+Shift+A')).toEqual({
      ctrl: true,
      shift: true,
      key: 'a',
    })
  })

  it('accepts cmd/meta as aliases for ctrl', () => {
    expect(parseShortcut('Cmd+S')?.ctrl).toBe(true)
    expect(parseShortcut('Meta+S')?.ctrl).toBe(true)
  })

  it('returns null for a bare single-token shortcut', () => {
    expect(parseShortcut('S')).toBeNull()
  })

  it('returns null for an unrecognized modifier token', () => {
    expect(parseShortcut('Alt+S')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(parseShortcut('')).toBeNull()
    expect(parseShortcut('Ctrl+')).toBeNull()
    expect(parseShortcut('+S')).toBeNull()
  })
})

describe('matchesShortcut', () => {
  it('matches a plain Ctrl+S against a matching event', () => {
    const parsed = parseShortcut('Ctrl+S')!
    expect(matchesShortcut(keyEvent({ key: 's', ctrlKey: true }), parsed)).toBe(
      true,
    )
  })

  it('is case-insensitive on the key', () => {
    const parsed = parseShortcut('Ctrl+S')!
    expect(matchesShortcut(keyEvent({ key: 'S', ctrlKey: true }), parsed)).toBe(
      true,
    )
  })

  it('does not match when Shift is held but not required', () => {
    const parsed = parseShortcut('Ctrl+S')!
    expect(
      matchesShortcut(
        keyEvent({ key: 's', ctrlKey: true, shiftKey: true }),
        parsed,
      ),
    ).toBe(false)
  })

  it('does not match when Alt is held, even if Ctrl+key otherwise matches', () => {
    // Regression: Ctrl+Alt+S used to still fire a plain Ctrl+S binding
    // because matchesShortcut never checked ev.altKey.
    const parsed = parseShortcut('Ctrl+S')!
    expect(
      matchesShortcut(
        keyEvent({ key: 's', ctrlKey: true, altKey: true }),
        parsed,
      ),
    ).toBe(false)
  })

  it('treats metaKey as equivalent to ctrlKey', () => {
    const parsed = parseShortcut('Ctrl+S')!
    expect(matchesShortcut(keyEvent({ key: 's', metaKey: true }), parsed)).toBe(
      true,
    )
  })
})
