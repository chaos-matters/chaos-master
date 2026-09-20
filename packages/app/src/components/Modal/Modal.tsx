import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import { pushBackHandler } from '@/lib/backStack'
import ui from './Modal.module.css'
import { ModalContext } from './ModalContext'
import type { ParentProps } from 'solid-js'
import type { ModalConfig } from './ModalContext'

function showModal(dialog: HTMLDialogElement) {
  onMount(() => {
    if (dialog.isConnected) {
      dialog.showModal()
    } else {
      // prettier-ignore
      console.error(`Showing modal did not succeed because dialog was not connected to DOM in onMount.`, dialog)
    }
  })
}

type ModalInstance<T> = {
  config: ModalConfig<T>
  resolve: (value: T) => void
}

type ModalProps = {
  mount?: Node | undefined
}
/**
 * Allows the subtree to request modals in
 * async code for the purpose of user input.
 *
 * Example:
 * ```
 * <Modal>
 *   ... elements which can useRequestModal ...
 * </Modal>
 *
 * async function onClick() {
 *   ...
 *   const response = await requestModal({
 *     content: ({ respond }) => (
 *       <>
 *         <h1>Are you sure?</h1>
 *         <p>
 *           You are about to delete 3 items.
 *         </p>
 *         <footer>
 *           <button onClick={() => respond('keep')}>
 *             Cancel
 *           </button>
 *           <button onClick={() => respond('delete')}>
 *             Delete
 *           </button>
 *         </footer
 *       </>
 *   })
 *   if (response === 'keep') {
 *     return
 *   }
 *   ...
 * }
 * ```
 */
export function Modal(props: ParentProps<ModalProps>) {
  const [modalInstances, setModalInstances] = createSignal<
    Array<ModalInstance<unknown>>
  >([])

  function requestModal<T>(config: ModalConfig<T>): Promise<T> {
    const { resolve, promise } = Promise.withResolvers<T>()
    const instance: ModalInstance<unknown> = {
      config,
      resolve: resolve as (value: unknown) => void,
    }
    setModalInstances((prev) => [...prev, instance])
    return promise
  }

  return (
    <ModalContext.Provider value={requestModal}>
      {props.children}
      <Portal
        mount={props.mount}
        ref={(el) => {
          ;(el as HTMLElement).classList.add(ui.root || '')
        }}
      >
        <For each={modalInstances()}>
          {(instance) => {
            const {
              resolve,
              config: { content: Content, class: class_ },
            } = instance

            // Answered once. With startViewTransition the removal from the
            // list is deferred into the transition's callback, so the item's
            // scope outlives the answer by a frame or two.
            let settled = false

            function respond(option: unknown) {
              if (settled) return
              settled = true
              if ('startViewTransition' in document) {
                const transition = document.startViewTransition(() => {
                  resolve(option)
                  setModalInstances((instances) =>
                    instances.filter((ins) => ins !== instance),
                  )
                })
                transition.ready.catch(() => {})
                transition.finished.catch(() => {})
              } else {
                resolve(option)
                setModalInstances((instances) =>
                  instances.filter((ins) => ins !== instance),
                )
              }
            }

            // A dialog is the topmost layer while it is up, so the Android
            // back gesture closes it the way its own cancel does
            // (lib/backStack.ts). The entry stays until the scope disposes,
            // which under startViewTransition is a frame or two after the
            // answer - and answered, its handler does nothing. Dropping it at
            // the answer instead let the press that arrives in that window
            // through to the layer beneath, or minimised the app: the dialog
            // was still on screen, and something else took the press.
            // Swallowing one press during a 200ms dismissal is the safer half
            // of that trade.
            const dropBackEntry = pushBackHandler(() => {
              if (settled) return
              respond(undefined)
            }, 'modal')
            onCleanup(dropBackEntry)

            return (
              <dialog
                ref={showModal}
                class={ui.modal}
                classList={{ [class_ ?? '']: true }}
                onCancel={(ev) => {
                  ev.preventDefault()
                  respond(undefined)
                }}
              >
                <Content respond={respond} />
              </dialog>
            )
          }}
        </For>
      </Portal>
    </ModalContext.Provider>
  )
}
