import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backDepth, popBack } from '@/lib/backStack'
import { haptic } from '@/lib/haptics'
import { CAPSULE_OPEN_MS, ShellBar } from './ShellBar'
import type { ShellDestination } from './ShellBar'

// The real module is safe to call here: every method delegates to NO_HAPTICS
// until the native ports load, which they never do on the web. Restating all
// eight as a mock only created a second copy to keep in step with the module.
const selectionChanged = vi.spyOn(haptic, 'selectionChanged')

function mount(mode: 'full' | 'capsule', current: ShellDestination = 'create') {
  const onSelect = vi.fn()
  render(() => (
    <ShellBar
      mode={mode}
      current={() => current}
      onSelect={onSelect}
      more={{ onOpenSettings: () => undefined }}
    />
  ))
  return { onSelect }
}

const capsule = () => screen.getByLabelText('Create, navigation')

describe('ShellBar', () => {
  beforeEach(() => {
    selectionChanged.mockClear()
  })
  afterEach(cleanup)

  it('names its destinations and marks the current one', () => {
    const { onSelect } = mount('full', 'create')
    expect(
      screen
        .getByRole('button', { name: 'Create' })
        .getAttribute('aria-current'),
    ).toBe('page')
    const library = screen.getByRole('button', { name: 'Library' })
    expect(library.getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()

    library.click()
    expect(onSelect).toHaveBeenCalledWith('library')
    expect(selectionChanged).toHaveBeenCalledTimes(1)
  })

  /**
   * A real tap is pointerdown, pointerup, then click - in that order, with
   * the release before the click. Firing a click while the pointer is still
   * down is a sequence no browser produces, and it is what hid the bug this
   * suite now covers.
   */
  function tap(element: HTMLElement) {
    fireEvent.pointerDown(element)
    fireEvent.pointerUp(element)
    element.click()
  }

  it('opens on the touch down rather than on the release', () => {
    vi.useFakeTimers()
    mount('capsule')
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    expect(capsule().getAttribute('aria-expanded')).toBe('false')

    // A press and hold shows the bar; the user should not have to let go to
    // find out whether anything happened.
    fireEvent.pointerDown(capsule())
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    expect(capsule().getAttribute('aria-expanded')).toBe('true')
    expect(backDepth()).toBe(1)
    vi.useRealTimers()
  })

  it('holds while the finger rests on it, and counts down from the release', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule())
    vi.advanceTimersByTime(CAPSULE_OPEN_MS * 2)
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()

    fireEvent.pointerUp(capsule())
    capsule().click()
    vi.advanceTimersByTime(CAPSULE_OPEN_MS - 1)
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    vi.advanceTimersByTime(1)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    expect(backDepth()).toBe(0)
    vi.useRealTimers()
  })

  it('stays up through the tap that opened it, and the next tap puts it away', () => {
    vi.useFakeTimers()
    mount('capsule')
    tap(capsule())
    // The release's click used to toggle `expanded` back off, so the bar
    // closed the instant the finger lifted.
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()

    // Fixing that by always opening took the dismissal away instead: the bar
    // covers the chip row, and only back or the countdown put it back.
    tap(capsule())
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    expect(capsule().getAttribute('aria-expanded')).toBe('false')
    expect(backDepth()).toBe(0)
    vi.useRealTimers()
  })

  it('opens and closes from a keyboard activation, which brings no pointer', () => {
    vi.useFakeTimers()
    mount('capsule')
    capsule().click()
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    capsule().click()
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    vi.useRealTimers()
  })

  it('lets go of the bar when the finger that held it lifts elsewhere', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })
    // The pointer is not captured, so a finger that slides off the capsule
    // releases over whatever is under it; the countdown still has to start.
    fireEvent.pointerUp(document.body, { pointerId: 1 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    vi.useRealTimers()
  })

  it('ignores another finger lifting while the first still holds it', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })

    // A second finger anywhere on the screen. The release listener was
    // pointer-agnostic, so this ended the hold: the bar collapsed three
    // seconds later with the first finger still down, and its own release
    // was never heard because the controller had been aborted.
    fireEvent.pointerUp(document.body, { pointerId: 2 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS * 2)
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()

    fireEvent.pointerUp(document.body, { pointerId: 1 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    vi.useRealTimers()
  })

  it('keeps the hold with the finger that started it when a second lands', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })

    // A second finger on the capsule itself re-entered the hold and aborted
    // the first finger's listener, so lifting the second started the
    // countdown while the first still rested on the bar - and the first
    // finger's own release was then never heard.
    fireEvent.pointerDown(capsule(), { pointerId: 2 })
    fireEvent.pointerUp(capsule(), { pointerId: 2 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS * 2)
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()

    fireEvent.pointerUp(capsule(), { pointerId: 1 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    vi.useRealTimers()
  })

  it('still answers the keyboard after a cancelled touch', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })

    // The system took the gesture. A cancelled touch brings no click after
    // it, so the flag saying "this touch opened the bar" had nothing to
    // consume it and swallowed the next Enter on the focused capsule.
    fireEvent.pointerCancel(capsule(), { pointerId: 1 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS - 1)
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()

    capsule().click()
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    expect(capsule().getAttribute('aria-expanded')).toBe('false')
    vi.useRealTimers()
  })

  it('lets go when a mouse is released where the page cannot see it', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })

    // A drag off the window and a release over another app: no pointerup
    // reaches the document at all. The hold was left set for the life of the
    // component - the bar sat open over the chip row, the countdown could
    // never start, and no later press was accepted either.
    fireEvent.pointerMove(document.body, { pointerId: 1, buttons: 0 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()

    // And the capsule still answers the next press.
    fireEvent.pointerDown(capsule(), { pointerId: 1 })
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    vi.useRealTimers()
  })

  it('lets go when the window loses focus under the held button', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })

    fireEvent.blur(window)
    vi.advanceTimersByTime(CAPSULE_OPEN_MS)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    vi.useRealTimers()
  })

  it('does not let a focus loss close the bar under the real release', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })

    // A system surface takes focus with the finger still on the capsule.
    // Ending the hold as though the pointer were gone disarmed the click
    // that its real release brings, and that click then read as a tap on an
    // open bar: the bar shut the instant the finger lifted, which is the
    // symptom the capsule was fixed for in the first place.
    fireEvent.blur(window)
    vi.advanceTimersByTime(CAPSULE_OPEN_MS - 1)
    fireEvent.pointerUp(capsule(), { pointerId: 1 })
    capsule().click()
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()

    // It still puts itself away on the countdown the focus loss started.
    vi.advanceTimersByTime(1)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    vi.useRealTimers()
  })

  it('still answers the keyboard after a focus loss with no release', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })
    fireEvent.blur(window)
    // The countdown puts the bar away, which retires the flag with it, so a
    // pointer that never reports back cannot swallow a later activation.
    vi.advanceTimersByTime(CAPSULE_OPEN_MS)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()

    capsule().click()
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    vi.useRealTimers()
  })

  it('keeps holding while the button is still down', () => {
    vi.useFakeTimers()
    mount('capsule')
    fireEvent.pointerDown(capsule(), { pointerId: 1 })

    // A drag with the button down is not a release, whatever it passes over.
    fireEvent.pointerMove(document.body, { pointerId: 1, buttons: 1 })
    // Nor is another pointer hovering.
    fireEvent.pointerMove(document.body, { pointerId: 2, buttons: 0 })
    vi.advanceTimersByTime(CAPSULE_OPEN_MS * 2)
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    vi.useRealTimers()
  })

  it('collapses on back', () => {
    vi.useFakeTimers()
    mount('capsule')
    tap(capsule())
    expect(popBack()).toBe(true)
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    expect(backDepth()).toBe(0)
    vi.useRealTimers()
  })

  it('closes the More menu when the backdrop is tapped', () => {
    mount('full')
    screen.getByRole('button', { name: 'More' }).click()
    expect(screen.getByRole('menu')).toBeTruthy()

    screen.getByTestId('shell-more-backdrop').click()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(backDepth()).toBe(0)
  })

  it('opens the shared More list, and back closes it', () => {
    mount('full')
    screen.getByRole('button', { name: 'More' }).click()
    expect(screen.getByText('Settings and more')).toBeTruthy()
    expect(backDepth()).toBe(1)

    expect(popBack()).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(backDepth()).toBe(0)
  })
})
