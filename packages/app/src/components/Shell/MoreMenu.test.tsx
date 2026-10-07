/**
 * The More menu closes on Escape, as the desktop dialogs and the Advanced
 * tools drawer do. It registered only Android's back gesture, so on a tablet
 * with a keyboard, or a desktop window in the touch layout, Escape left it
 * open.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Info } from '@/icons'
import { popBack } from '@/lib/backStack'
import { MoreMenu } from './MoreMenu'

type KeyListener = (event: KeyboardEvent) => void

function mount(onBehind = vi.fn<KeyListener>()) {
  const [open, setOpen] = createSignal(true)
  const onClose = vi.fn(() => setOpen(false))
  // A listener behind the menu: the editor's shortcuts, Home's Escape.
  document.addEventListener('keydown', onBehind)
  render(() => (
    <MoreMenu
      items={[{ label: 'Settings and more', Icon: Info, run: () => {} }]}
      open={open()}
      onClose={onClose}
      menuClass=""
    />
  ))
  return { onClose, onBehind, setOpen }
}

const escape = () =>
  new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  })

describe('the More menu', () => {
  let behind: KeyListener | undefined
  afterEach(() => {
    cleanup()
    if (behind) document.removeEventListener('keydown', behind)
    behind = undefined
  })

  it('closes on Escape', () => {
    const { onClose, onBehind } = mount()
    behind = onBehind
    expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy()

    document.body.dispatchEvent(escape())

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('takes the Escape it closes on, so nothing behind it acts on it too', () => {
    const { onBehind } = mount()
    behind = onBehind
    document.body.dispatchEvent(escape())
    expect(onBehind).not.toHaveBeenCalled()
  })

  it('leaves Escape alone while it is closed', () => {
    const { onClose, onBehind, setOpen } = mount()
    behind = onBehind
    setOpen(false)
    document.body.dispatchEvent(escape())
    expect(onClose).not.toHaveBeenCalled()
    expect(onBehind).toHaveBeenCalledOnce()
  })

  it('ignores other keys', () => {
    const { onClose, onBehind } = mount()
    behind = onBehind
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('the More menu, closed from the keyboard or back', () => {
  afterEach(cleanup)

  function mountWithTrigger(passTrigger: boolean) {
    const [open, setOpen] = createSignal(false)
    let button: HTMLButtonElement | undefined
    render(() => (
      <>
        <button ref={button} type="button" onClick={() => setOpen(true)}>
          More
        </button>
        <MoreMenu
          items={[{ label: 'Settings and more', Icon: Info, run: () => {} }]}
          open={open()}
          onClose={() => setOpen(false)}
          menuClass=""
          {...(passTrigger ? { trigger: () => button } : {})}
        />
      </>
    ))
    return { trigger: () => button!, setOpen }
  }

  it('hands focus back to the trigger it was given', () => {
    const { trigger, setOpen } = mountWithTrigger(true)
    setOpen(true)
    screen.getByRole('menuitem').focus()
    document.body.dispatchEvent(escape())
    expect(document.activeElement).toBe(trigger())
  })

  it('without one, hands it back to what had it when the list opened', () => {
    const { trigger, setOpen } = mountWithTrigger(false)
    trigger().focus()
    setOpen(true)
    screen.getByRole('menuitem').focus()
    expect(popBack()).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('leaves the focus to what an item opens', () => {
    const { trigger, setOpen } = mountWithTrigger(true)
    setOpen(true)
    const item = screen.getByRole('menuitem')
    item.focus()
    item.click()
    expect(document.activeElement).not.toBe(trigger())
  })
})
