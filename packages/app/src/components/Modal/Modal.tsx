import { createContext, createSignal, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { useContextSafe } from '@/utils/useContextSafe'
import ui from './Modal.module.css'
import type { JSX, ParentProps } from 'solid-js'

export type ModalConfig<T> = {
  class?: string
  content: (props: { respond: (value: T) => void }) => JSX.Element
}

/** Helper function that allows typescript to infer the correct response type. */
export function defineModal<T>(modal: ModalConfig<T>) {
  return modal
}

export type RequestModalFn = <T = void>(config: ModalConfig<T>) => Promise<T>

export const ModalContext = createContext<RequestModalFn>()

export function useRequestModal() {
  return useContextSafe(ModalContext, 'useRequestModal', 'Modal')
}

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
      // @ts-expect-error this can't be modeled in ts
      resolve,
    }
    setModalInstances((prev) => [...prev, instance])
    return promise
  }

  return (
    <>
      <ModalContext.Provider value={requestModal}>
        {props.children}
      </ModalContext.Provider>
      <Portal
        mount={props.mount}
        ref={(el) => {
          el.classList.add(ui.root)
        }}
      >
        <Show when={modalInstances()[0]} keyed>
          {(instance) => {
            const {
              resolve,
              config: { content: Content, class: class_ },
            } = instance

            function respond(option: unknown) {
              document.startViewTransition(() => {
                resolve(option)
                setModalInstances((instances) =>
                  instances.filter((ins) => ins !== instance),
                )
              })
            }

            return (
              <dialog
                ref={showModal}
                class={ui.modal}
                classList={{ [class_ ?? '']: true }}
                onCancel={(ev) => {
                  ev.preventDefault()
                }}
              >
                <Content respond={respond} />
              </dialog>
            )
          }}
        </Show>
      </Portal>
    </>
  )
}
