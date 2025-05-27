import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { JSX } from 'solid-js'

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
