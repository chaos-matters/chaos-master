/* eslint-disable no-console */
import { createSignal } from 'solid-js'

export type LogType = 'log' | 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  type: LogType
  timestamp: number
  args: unknown[]
}

const MAX_ENTRIES = 2000

const [consoleLogs, setConsoleLogs] = createSignal<LogEntry[]>([])

export { consoleLogs }

export function clearConsoleLogs() {
  setConsoleLogs([])
}

function pushEntry(type: LogType, args: unknown[]) {
  setConsoleLogs((prev) => {
    const next = [...prev, { type, timestamp: Date.now(), args }]
    if (next.length > MAX_ENTRIES) {
      return next.slice(next.length - MAX_ENTRIES)
    }
    return next
  })
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
    pushEntry('log', args)
    _orig.log(...args)
  }

  console.error = (...args: unknown[]) => {
    pushEntry('error', args)
    _orig.error(...args)
  }

  console.warn = (...args: unknown[]) => {
    pushEntry('warn', args)
    _orig.warn(...args)
  }

  console.info = (...args: unknown[]) => {
    pushEntry('info', args)
    _orig.info(...args)
  }

  console.debug = (...args: unknown[]) => {
    pushEntry('debug', args)
    _orig.debug(...args)
  }
}
