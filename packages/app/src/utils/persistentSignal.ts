import { createSignal } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'

const PREFIX = 'chaos-master-'

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

interface PersistentSignalOptions<T, S> {
  /** Transform runtime value to a JSON-serializable form for storage */
  serialize: (value: T) => S
  /** Transform stored value back to runtime form */
  deserialize: (stored: S) => T
}

/**
 * A SolidJS signal that persists to localStorage.
 * Reads the initial value from localStorage on creation (falls back to defaultValue),
 * and writes every update automatically.
 *
 * Use the options overload for non-JSON-serializable types like Set, Map, etc.
 */
export function persistentSignal<T>(
  key: string,
  defaultValue: T,
): [Accessor<T>, Setter<T>]
export function persistentSignal<T, S>(
  key: string,
  defaultValue: T,
  options: PersistentSignalOptions<T, S>,
): [Accessor<T>, Setter<T>]
export function persistentSignal<T, S>(
  key: string,
  defaultValue: T,
  options?: PersistentSignalOptions<T, S>,
): [Accessor<T>, Setter<T>] {
  const stored = readStored<S>(key)
  const initial: T =
    stored !== null && options
      ? options.deserialize(stored)
      : stored !== null
        ? (stored as unknown as T)
        : defaultValue

  const [get, set] = createSignal<T>(initial)

  const toStore = options ? (v: T) => options.serialize(v) : (v: T) => v

  const persistedSet: Setter<T> = ((value: T | ((prev: T) => T)): T => {
    const next =
      typeof value === 'function' ? (value as (prev: T) => T)(get()) : value
    writeStored(key, toStore(next))
    return set(() => next)
  }) as Setter<T>

  return [get, persistedSet]
}
