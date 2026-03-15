import { createContext, createMemo, createSignal, onCleanup, onMount, } from 'solid-js'
import { isDefined } from '@/utils/isDefined'
import { useContextSafe } from '@/utils/useContextSafe'
import type { Accessor, ParentProps, Setter } from 'solid-js'

type GateProviderProps = {
  capacity: number
}

type GateContext<T> = {
  setItems: Setter<Map<symbol, () => T | undefined>>
  allowedItems: () => Set<symbol>
}

/**
 * Creates a context that allows only N highest-priority
 * registered components (`capacity`) to be active at the same time.
 * Already allowed components will be preferred as tie-breaker.
 * Use priority `0` to forbid a component from running.
 *
 * Components register with `useGate`, which returns a signal indicating
 * whether the component is currently allowed.
 *
 * @example
 * const { Provider: ComputeGate, useGate: useComputeGate } =
 *   createGateContext("Compute", (s: { isVisible: boolean }) => isVisible ? 2 : 1)
 *
 * function Item(props) {
 *   const allowed = useGate(isVisible)
 *   ... use allowed() signal in heavy computation ...
 *   return <>...</>
 * }
 *
 * <Gate capacity={5}>
 *   <Item ... />
 *   <Item ... />
 *   <Item ... />
 * </Gate>
 */
export function createGateContext<T>(
  name: string,
  priority: (state: T) => number,
) {
  const Context = createContext<GateContext<T>>()

  function Provider(props: ParentProps<GateProviderProps>) {
    const [items, setItems] = createSignal(
      new Map<symbol, () => T | undefined>(),
      {
        equals: false,
      },
    )
    const allowedItems = createMemo<Set<symbol>>((prev) => {
      const capacity = props.capacity
      const items_ = items()
      const itemsWithPriority = [...items_.entries()].map(([id, state]) => {
        const state_ = state()
        if (state_ === undefined) {
          return undefined
        }
        return {
          id,
          priority: priority(state_),
          wasAllowed: prev?.has(id) ?? false,
        }
      })
      if (itemsWithPriority.some((item) => item === undefined)) {
        return new Set()
      }
      const orderedItems = itemsWithPriority
        .filter(isDefined)
        .filter((item) => item.priority > 0)
        .sort(
          (a, b) =>
            b.priority - a.priority ||
            Number(b.wasAllowed) - Number(a.wasAllowed),
        )
        .slice(0, capacity)
      return new Set(orderedItems.map(({ id }) => id))
    })
    return (
      <Context.Provider value={{ allowedItems, setItems }}>
        {props.children}
      </Context.Provider>
    )
  }

  function useGate(state: () => T | undefined): Accessor<boolean> {
    const id = Symbol(`${name}GateSymbol`)
    const { allowedItems, setItems } = useContextSafe(
      Context,
      `use${name}Gate`,
      `${name}Context`,
    )
    onMount(() => {
      setItems((items) => {
        items.set(id, state)
        return items
      })
    })
    onCleanup(() => {
      setItems((items) => {
        items.delete(id)
        return items
      })
    })
    return createMemo(() => allowedItems().has(id))
  }

  return { Provider, useGate }
}
