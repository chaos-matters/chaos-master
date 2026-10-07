/**
 * The screen lock over everything else on the page, dialogs included.
 *
 * A control the viewer had focused kept the keyboard under the lock, so the
 * page behind it had to go inert. Marking it inert by hand missed two
 * things: a modal dialog already open sat in the browser's top layer, above
 * the shield, and kept every key and click; and a dialog or a portal opened
 * during the take was never marked at all. So the shield is a modal dialog
 * itself, the newest one, which the browser draws above everything and which
 * makes the rest of the page inert, late arrivals included. A modal opened
 * after it goes back underneath. The end card is one too, so it lands over
 * the dialog the viewer left open, and when it goes that dialog is theirs
 * again, as it was.
 *
 * happy-dom has no top layer, so "topmost" here is the newest open dialog
 * shown with showModal(), which is the browser's rule. The real stacking,
 * the keys and Escape are covered in tests/pilot-lock-focus.ci.spec.ts.
 *
 * A seat lock (a duel) leaves the page alone: the viewer is playing.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { endPilot, resetPilot, startPilot } from '@/arcade/pilot'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { PilotOverlay } from './PilotOverlay'
import type { MockInstance } from 'vitest'

// The ring's own behaviour is PilotSpotlight.test.tsx; here only where it is.
vi.mock('./PilotSpotlight', () => ({
  PilotSpotlight: () => <div data-testid="spotlight" />,
}))

function drive(lock: 'screen' | 'seat') {
  startPilot({
    mode: lock === 'screen' ? 'cinema' : 'duel',
    title: 'Animating your flame',
    stepBudget: 25,
    allowed: ['timeline.'],
    qualityRankAtStart: 1,
    seatId: lock === 'screen' ? 'player' : 'rival',
    lock,
  })
}

let showModal: MockInstance<HTMLDialogElement['showModal']>

beforeEach(() => {
  showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
})

/** Every dialog shown with showModal(), in order. */
const shown = () => showModal.mock.contexts as HTMLDialogElement[]

afterEach(() => {
  cleanup()
  resetPilot()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

/** The modal the browser would draw on top: the newest one still open. */
const topmost = () => shown().findLast((d) => d.isConnected && d.open)

/** A stand-in for the workspace, with the kinds of control the brief names:
 *  a slider, a text field and a button. */
function mountWorkspace() {
  const workspace = document.createElement('div')
  const slider = document.createElement('input')
  slider.type = 'range'
  const field = document.createElement('input')
  field.type = 'text'
  const button = document.createElement('button')
  button.textContent = 'Apply'
  workspace.append(slider, field, button)
  document.body.append(workspace)
  return { workspace, slider, field, button }
}

/** A modal dialog of the app's own kind, with a field in it. */
function openDialog(value = '') {
  const dialog = document.createElement('dialog')
  const field = document.createElement('input')
  field.value = value
  dialog.append(field)
  document.body.append(dialog)
  dialog.showModal()
  field.focus()
  return { dialog, field }
}

function lockDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'The agent is driving the editor' })
}

describe('the screen lock', () => {
  it('is the topmost modal, with the focus, over a dialog open before it', () => {
    const { dialog: before, field } = openDialog('kept')
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)

    drive('screen')

    const lock = lockDialog()
    expect(lock).toBeInstanceOf(HTMLDialogElement)
    expect(topmost()).toBe(lock)
    expect(document.activeElement).toBe(lock)
    // Left as it was, underneath.
    expect(before.open).toBe(true)
    expect(field.value).toBe('kept')
  })

  it('goes back over a modal opened during the take, which stays open under it', async () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    drive('screen')
    const lock = lockDialog()

    const { dialog: late } = openDialog()

    await vi.waitFor(() => {
      expect(topmost()).toBe(lock)
    })
    expect(late.open).toBe(true)
    expect(document.activeElement).toBe(lock)
  })

  it('comes back up when the browser closes it mid-take', async () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    drive('screen')
    const lock = lockDialog() as HTMLDialogElement

    lock.close()

    await vi.waitFor(() => {
      expect(lock.open).toBe(true)
    })
    expect(topmost()).toBe(lock)
  })

  it('draws the spotlight inside itself, so the ring stays above it', () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)

    drive('screen')

    expect(lockDialog().contains(screen.getByTestId('spotlight'))).toBe(true)
  })

  it('hands the focus to the end card, then to the control the viewer had', () => {
    const { slider } = mountWorkspace()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    slider.focus()
    drive('screen')

    endPilot('finished', { title: 'Pendulum waltz' })

    const card = screen.getByRole('dialog', { name: /Pendulum waltz/ })
    expect(card).toBeInstanceOf(HTMLDialogElement)
    expect(topmost()).toBe(card)
    expect(document.activeElement).toBe(card)

    resetPilot()

    expect(topmost()).toBeUndefined()
    expect(document.activeElement).toBe(slider)
  })

  it('hands a dialog open before it back as it was, focus and all', () => {
    const { dialog: before, field } = openDialog('kept')
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    drive('screen')
    endPilot('finished', { title: 'Pendulum waltz' })

    // The card lands over the dialog, and goes before it.
    expect(topmost()).toBe(
      screen.getByRole('dialog', { name: /Pendulum waltz/ }),
    )
    resetPilot()

    expect(topmost()).toBe(before)
    expect(field.value).toBe('kept')
    expect(document.activeElement).toBe(field)
  })

  it('refuses a close request: only Stop and Esc twice end the take', () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    drive('screen')
    const lock = lockDialog() as HTMLDialogElement

    const cancel = new Event('cancel', { cancelable: true })
    lock.dispatchEvent(cancel)

    expect(cancel.defaultPrevented).toBe(true)
    expect(lock.open).toBe(true)
  })

  it('lets a close request dismiss the end card, as Escape does', () => {
    const { slider } = mountWorkspace()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    slider.focus()
    drive('screen')
    endPilot('finished', { title: 'Pendulum waltz' })

    // A back gesture on a phone is a close request, not a key.
    const cancel = new Event('cancel', { cancelable: true })
    screen.getByRole('dialog', { name: /Pendulum waltz/ }).dispatchEvent(cancel)

    expect(cancel.defaultPrevented).toBe(true)
    expect(screen.queryByRole('dialog', { name: /Pendulum waltz/ })).toBeNull()
    expect(document.activeElement).toBe(slider)
  })

  it('gives focus straight back when the lock ends with no end card', () => {
    const { button } = mountWorkspace()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    button.focus()
    drive('screen')

    resetPilot()

    expect(topmost()).toBeUndefined()
    expect(document.activeElement).toBe(button)
  })

  it('does not reach for a control that went away while the agent drove', () => {
    const { field } = mountWorkspace()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    field.focus()
    drive('screen')
    field.remove()

    resetPilot()

    expect(document.activeElement).toBe(document.body)
  })
})

describe('a seat lock', () => {
  it('leaves the page and the focus alone', () => {
    const { slider } = mountWorkspace()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    slider.focus()

    drive('seat')

    expect(shown()).toEqual([])
    expect(document.activeElement).toBe(slider)
  })
})
