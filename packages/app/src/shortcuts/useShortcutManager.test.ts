import { describe, expect, it } from 'vitest'
import { letBrowserHandleActiveInput } from './useShortcutManager'

function makeInput(type: string): HTMLInputElement {
  const el = document.createElement('input')
  if (type) el.type = type
  return el
}

function ctrlS(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
}

describe('letBrowserHandleActiveInput', () => {
  it('returns false when nothing is focused', () => {
    expect(letBrowserHandleActiveInput(null, ctrlS())).toBe(false)
  })

  it('lets the browser handle a plain text input', () => {
    expect(letBrowserHandleActiveInput(makeInput('text'), ctrlS())).toBe(true)
  })

  it('lets the browser handle a textarea', () => {
    expect(
      letBrowserHandleActiveInput(document.createElement('textarea'), ctrlS()),
    ).toBe(true)
  })

  it('lets the browser handle number and email inputs', () => {
    // Regression: Ctrl+S used to fire the sidebar-toggle shortcut while
    // typing/selecting inside a number or email field.
    expect(letBrowserHandleActiveInput(makeInput('number'), ctrlS())).toBe(true)
    expect(letBrowserHandleActiveInput(makeInput('email'), ctrlS())).toBe(true)
  })

  it('still intercepts shortcuts while a checkbox is focused', () => {
    expect(letBrowserHandleActiveInput(makeInput('checkbox'), ctrlS())).toBe(
      false,
    )
  })

  it('lets the browser handle Space on a checkbox', () => {
    const spaceEvent = new KeyboardEvent('keydown', { code: 'Space' })
    expect(letBrowserHandleActiveInput(makeInput('checkbox'), spaceEvent)).toBe(
      true,
    )
  })
})
