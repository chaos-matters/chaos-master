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

function mountModalHost(): RequestModalFn {
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
  if (!request) throw new Error('the modal host did not mount')
  return request
}

/**
 * A startViewTransition that never runs its update callback: a renderer that
 * has not produced a frame yet. jsdom has none of its own, so without this a
 * dismissal that waited for one would pass here all the same.
 */
function stallViewTransitions(): () => void {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: () => ({ ready: Promise.resolve(), finished: Promise.resolve() }),
  })
  return () => {
    Reflect.deleteProperty(document, 'startViewTransition')
  }
}

describe('Modal and back', () => {
  afterEach(cleanup)

  it('cancels the top dialog and leaves the registry empty', async () => {
    const request = mountModalHost()

    const answer = request<string | undefined>({
      content: () => <p>Keep this flame?</p>,
    })
    expect(backDepth()).toBe(1)

    expect(popBack()).toBe(true)
    // Back does what the dialog's own cancel does: the request is answered
    // with the cancel value, not left pending.
    await expect(answer).resolves.toBeUndefined()
    expect(backDepth()).toBe(0)
  })

  it('goes at the answer, back entry and all, without waiting for a frame', async () => {
    // Taking an answered dialog down used to wait in startViewTransition's
    // callback, so it stayed on screen, answered, until the browser rendered
    // a frame - seconds, while an export kept the GPU busy - and its back
    // entry had to stay for that window too, swallowing the next press. Gone
    // at the answer, it leaves no window: the next press is for the layer
    // that is on screen now.
    const restore = stallViewTransitions()
    const beneath = vi.fn()
    const dropBeneath = pushBackHandler(beneath, 'beneath')

    try {
      const request = mountModalHost()
      const answer = request<string | undefined>({
        content: () => <p>Keep this flame?</p>,
      })
      expect(backDepth()).toBe(2)

      expect(popBack()).toBe(true)
      expect(document.querySelector('dialog')).toBeNull()
      await expect(answer).resolves.toBeUndefined()
      expect(backDepth()).toBe(1)
      expect(beneath).not.toHaveBeenCalled()

      expect(popBack()).toBe(true)
      expect(beneath).toHaveBeenCalledTimes(1)
    } finally {
      dropBeneath()
      restore()
    }
  })

  it('goes at its own button, and the next back reaches the layer beneath', async () => {
    // The same, reached the way a user reaches it: tap Cancel, press back.
    const restore = stallViewTransitions()
    const beneath = vi.fn()
    const dropBeneath = pushBackHandler(beneath, 'beneath')

    try {
      const request = mountModalHost()
      const answer = request<string | undefined>({
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
      expect(document.querySelector('dialog')).toBeNull()
      await expect(answer).resolves.toBe('cancel')
      expect(backDepth()).toBe(1)

      expect(popBack()).toBe(true)
      expect(beneath).toHaveBeenCalledTimes(1)
    } finally {
      dropBeneath()
      restore()
    }
  })
})
