import { createContext, createSignal, For, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { useContextSafe } from '@/utils/useContextSafe'
import ui from './Modal.module.css'
import type { JSX, ParentProps } from 'solid-js'

export type ModalConfig<T extends string> = {
  title: string | (() => JSX.Element)
  message: string | (() => JSX.Element)
  options: Record<T, (props: { onClick: () => void }) => JSX.Element>
  class?: string
}

/** Helper function that allows typescript to infer the correct response type. */
export function defineModal<T extends string>(modal: ModalConfig<T>) {
  return modal
}

export type RequestModalFn = <T extends string>(
  config: ModalConfig<T>,
) => Promise<T>

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

type ModalInstance<T extends string> = {
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
 *     title: "Are you sure?",
 *     message: () => (
 *       <>
 *         You are about to delete 3 items
 *         <br />
 *         Be careful!
 *       </>
 *     options: {
 *       delete: (props) => (
 *         <Button onClick={props.onClick}>
 *           Delete
 *         </Button>
 *       ),
 *       keep: (props) => (
 *         <Button autofocus onClick={props.onClick}>
 *           Keep
 *         </Button>
 *       ),
 *     }
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
    Array<ModalInstance<string>>
  >([])

  function requestModal<T extends string>(config: ModalConfig<T>): Promise<T> {
    const { resolve, promise } = Promise.withResolvers<T>()
    const instance: ModalInstance<string> = {
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
      <Portal mount={props.mount}>
        <Show when={modalInstances()[0]} keyed>
          {(instance) => {
            const {
              resolve,
              config: {
                title: Title,
                message: Message,
                options,
                class: class_,
              },
            } = instance
            return (
              <dialog
                ref={showModal}
                classList={{ [ui.modal]: true, [class_ ?? '']: true }}
                onCancel={(ev) => {
                  ev.preventDefault()
                }}
              >
                <div class={ui.title}>
                  {typeof Title === 'string' ? Title : <Title />}
                </div>
                <div class={ui.message}>
                  {typeof Message === 'string' ? Message : <Message />}
                </div>
                <div class={ui.options}>
                  <For each={Object.entries(options)}>
                    {([option, OptionElement]) => (
                      <OptionElement
                        onClick={() => {
                          resolve(option)
                          setModalInstances((instances) =>
                            instances.filter((ins) => ins !== instance),
                          )
                        }}
                      />
                    )}
                  </For>
                </div>
              </dialog>
            )
          }}
        </Show>
      </Portal>
    </>
  )
}
