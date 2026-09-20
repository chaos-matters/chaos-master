import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backDepth, popBack, pushBackHandler } from '@/lib/backStack'
import { Modal } from './Modal'
import { useRequestModal } from './ModalContext'
import type { RequestModalFn } from './ModalContext'

function Host(props: { onReady: (request: RequestModalFn) => void }) {
  props.onReady(useRequestModal())
  return null
}

describe('Modal and back', () => {
  afterEach(cleanup)

  it('cancels the top dialog and leaves the registry empty', async () => {
    let request: RequestModalFn | undefined
    render(() => (
      <Modal>
        <Host
          onReady={(fn) => {
            request = fn
          }}
        />
      </Modal>
    ))

    const answer = request?.<string | undefined>({
      content: () => <p>Keep this flame?</p>,
    })
    expect(backDepth()).toBe(1)

    expect(popBack()).toBe(true)
    // Back does what the dialog's own cancel does: the request is answered
    // with the cancel value, not left pending.
    await expect(answer).resolves.toBeUndefined()
    expect(backDepth()).toBe(0)
  })

  it('swallows a back that arrives while it is dismissing', async () => {
    // startViewTransition defers the removal from the list into its own
    // callback, so the dialog is still on screen for a frame or two after it
    // has been answered. Dropping its back entry at the answer let a press
    // inside that window through: the layer beneath was dismissed by a press
    // meant for the dialog, and with an empty stack the app minimised.
    const deferred: (() => void)[] = []
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        deferred.push(callback)
        return { ready: Promise.resolve(), finished: Promise.resolve() }
      },
    })
    const beneath = vi.fn()
    const dropBeneath = pushBackHandler(beneath, 'beneath')

    try {
      let request: RequestModalFn | undefined
      render(() => (
        <Modal>
          <Host
            onReady={(fn) => {
              request = fn
            }}
          />
        </Modal>
      ))

      const answer = request?.<string | undefined>({
        content: () => <p>Keep this flame?</p>,
      })
      expect(backDepth()).toBe(2)

      // The answer, then a second press before the transition has run.
      expect(popBack()).toBe(true)
      expect(popBack()).toBe(true)
      expect(beneath).not.toHaveBeenCalled()

      // Once the dialog is actually gone, the stack is the layer beneath's.
      deferred.forEach((callback) => {
        callback()
      })
      await expect(answer).resolves.toBeUndefined()
      expect(backDepth()).toBe(1)
      expect(popBack()).toBe(true)
      expect(beneath).toHaveBeenCalledTimes(1)
    } finally {
      dropBeneath()
      Reflect.deleteProperty(document, 'startViewTransition')
    }
  })

  it('swallows a back that follows its own button', async () => {
    // The same window, reached the way a user reaches it: tap Cancel, press
    // back before the dialog has finished leaving.
    const deferred: (() => void)[] = []
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        deferred.push(callback)
        return { ready: Promise.resolve(), finished: Promise.resolve() }
      },
    })
    const beneath = vi.fn()
    const dropBeneath = pushBackHandler(beneath, 'beneath')

    try {
      let request: RequestModalFn | undefined
      render(() => (
        <Modal>
          <Host
            onReady={(fn) => {
              request = fn
            }}
          />
        </Modal>
      ))

      const answer = request?.<string | undefined>({
        content: (props) => (
          <button
            type="button"
            onClick={() => {
              props.respond('cancel')
            }}
          >
            Cancel
          </button>
        ),
      })
      expect(backDepth()).toBe(2)

      document.querySelector<HTMLButtonElement>('dialog button')?.click()
      expect(popBack()).toBe(true)
      expect(beneath).not.toHaveBeenCalled()

      deferred.forEach((callback) => {
        callback()
      })
      await expect(answer).resolves.toBe('cancel')
      expect(backDepth()).toBe(1)
    } finally {
      dropBeneath()
      Reflect.deleteProperty(document, 'startViewTransition')
    }
  })
})
