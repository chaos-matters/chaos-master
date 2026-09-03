/* eslint-disable no-console */
import { createStore, produce } from 'solid-js/store'
import { serializeLogArgs } from '@/utils/serializeLogArgs'

export type LogType = 'log' | 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  type: LogType
  timestamp: number
  /**
   * Bounded snapshot of the logged arguments, taken when the call happened.
   * Holding the arguments themselves would pin every object ever logged — GPU
   * handles, flame state, DOM subtrees — until the entry fell out of the ring
   * buffer, and would show later mutations instead of what was logged.
   */
  text: string
}

export const MAX_CONSOLE_ENTRIES = 2000

// A store rather than a signal: appending an entry used to build a whole new
// array, so every reader woke up on every console call. Here a push touches the
// new index and the length, and readers of the other entries stay asleep.
const [entries, setEntries] = createStore<LogEntry[]>([])

/** The captured console output, oldest first. */
export function consoleLogs(): readonly LogEntry[] {
  return entries
}

export function clearConsoleLogs() {
  setEntries(
    produce((list) => {
      list.splice(0, list.length)
    }),
  )
}

/** Records one entry. The console patch below is the only caller in the app. */
export function pushConsoleEntry(type: LogType, args: unknown[]) {
  const entry: LogEntry = {
    type,
    timestamp: Date.now(),
    text: serializeLogArgs(args),
  }
  setEntries(
    produce((list) => {
      list.push(entry)
      if (list.length > MAX_CONSOLE_ENTRIES) {
        list.splice(0, list.length - MAX_CONSOLE_ENTRIES)
      }
    }),
  )
}

// Guard against re-patching. ES modules are singletons in production, but a
// dev HMR reload can re-execute this module — without this flag the second run
// would capture the already-wrapped functions into `_orig` and wrap again, so
// every log would be pushed (and printed) twice per reload.
const PATCH_FLAG = '__chaosConsolePatched'
const consoleFlags = console as unknown as Record<string, boolean>

if (!consoleFlags[PATCH_FLAG]) {
  consoleFlags[PATCH_FLAG] = true

  const _orig = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  }

  console.log = (...args: unknown[]) => {
    pushConsoleEntry('log', args)
    _orig.log(...args)
  }

  console.error = (...args: unknown[]) => {
    pushConsoleEntry('error', args)
    _orig.error(...args)
  }

  console.warn = (...args: unknown[]) => {
    pushConsoleEntry('warn', args)
    _orig.warn(...args)
  }

  console.info = (...args: unknown[]) => {
    pushConsoleEntry('info', args)
    _orig.info(...args)
  }

  console.debug = (...args: unknown[]) => {
    pushConsoleEntry('debug', args)
    _orig.debug(...args)
  }
}
