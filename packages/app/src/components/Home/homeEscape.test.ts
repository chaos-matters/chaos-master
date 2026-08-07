import { describe, expect, it, vi } from 'vitest'
import { installHomeEscapeBoundary } from './homeEscape'

function testDocument() {
  const doc = document.implementation.createHTMLDocument()
  const target = doc.body.appendChild(doc.createElement('button'))
  return { doc, target }
}

function keydown(key: string) {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
}

describe('installHomeEscapeBoundary', () => {
  it('exits Home, claims Escape, and shields the mounted workspace', () => {
    const { doc, target } = testDocument()
    target.dataset.homeSelected = 'true'
    const hiddenWorkspaceHandler = vi.fn()
    const onExit = vi.fn()
    doc.addEventListener('keydown', hiddenWorkspaceHandler)
    const remove = installHomeEscapeBoundary(onExit, doc)

    const event = keydown('Escape')
    target.dispatchEvent(event)

    expect(onExit).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    expect(hiddenWorkspaceHandler).not.toHaveBeenCalled()
    remove()
  })

  it('reserves Escape for an open dialog and shields the hidden workspace', () => {
    const { doc, target } = testDocument()
    const dialog = doc.body.appendChild(doc.createElement('dialog'))
    dialog.setAttribute('open', '')
    const hiddenWorkspaceHandler = vi.fn()
    const onExit = vi.fn()
    doc.addEventListener('keydown', hiddenWorkspaceHandler)
    const remove = installHomeEscapeBoundary(onExit, doc)

    const modalEscape = keydown('Escape')
    target.dispatchEvent(modalEscape)
    expect(onExit).not.toHaveBeenCalled()
    expect(hiddenWorkspaceHandler).not.toHaveBeenCalled()
    // stopPropagation shields the editor; leaving default uncancelled preserves
    // the browser's native <dialog> cancel/close behavior.
    expect(modalEscape.defaultPrevented).toBe(false)

    dialog.remove()
    target.dispatchEvent(keydown('Escape'))
    expect(onExit).toHaveBeenCalledOnce()
    remove()
  })

  it('ignores other keys and detaches cleanly', () => {
    const { doc, target } = testDocument()
    const onExit = vi.fn()
    const remove = installHomeEscapeBoundary(onExit, doc)

    target.dispatchEvent(keydown('Enter'))
    expect(onExit).not.toHaveBeenCalled()

    remove()
    target.dispatchEvent(keydown('Escape'))
    expect(onExit).not.toHaveBeenCalled()
  })
})
