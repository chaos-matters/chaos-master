/* eslint-disable no-console */
import { createComputed, createRoot } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearConsoleLogs, consoleLogs, MAX_CONSOLE_ENTRIES, pushConsoleEntry, } from './console-store'

describe('console-store', () => {
  beforeEach(() => {
    clearConsoleLogs()
  })

  it('records a patched console call as a display-ready entry', () => {
    console.info('[WebGPU] Adapter acquired:', { vendor: 'intel' })

    const entries = consoleLogs()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.type).toBe('info')
    expect(entries[0]!.text).toBe(
      '[WebGPU] Adapter acquired: {\n  "vendor": "intel"\n}',
    )
    expect(entries[0]!.timestamp).toBeGreaterThan(0)
  })

  it('tags each patched console method with its own type', () => {
    console.log('a')
    console.error('b')
    console.warn('c')
    console.info('d')
    console.debug('e')

    expect(consoleLogs().map((entry) => entry.type)).toEqual([
      'log',
      'error',
      'warn',
      'info',
      'debug',
    ])
  })

  // The retention bug: entries used to keep `args` by reference, so every
  // object ever logged stayed reachable until it fell out of the ring buffer.
  it('keeps no reference to the logged value', () => {
    const heavy = { payload: new Array(1000).fill('x') }
    console.log('heavy', heavy)

    const entry = consoleLogs()[0]!
    expect(
      Object.values(entry).every((field) => typeof field !== 'object'),
    ).toBe(true)
  })

  it('snapshots the value at log time so later mutation cannot rewrite it', () => {
    const live = { state: 'before' }
    console.log(live)
    live.state = 'after'

    expect(consoleLogs()[0]!.text).toBe('{\n  "state": "before"\n}')
  })

  it('drops the oldest entries once the buffer is full', () => {
    for (let i = 0; i < MAX_CONSOLE_ENTRIES + 5; i++) {
      pushConsoleEntry('log', [`entry ${i}`])
    }

    const entries = consoleLogs()
    expect(entries).toHaveLength(MAX_CONSOLE_ENTRIES)
    expect(entries[0]!.text).toBe('entry 5')
    expect(entries.at(-1)!.text).toBe(`entry ${MAX_CONSOLE_ENTRIES + 4}`)
  })

  it('empties the buffer when cleared', () => {
    console.log('a')
    clearConsoleLogs()

    expect(consoleLogs()).toHaveLength(0)
  })

  it('keeps one list identity across pushes', () => {
    const before = consoleLogs()
    pushConsoleEntry('log', ['a'])

    expect(consoleLogs()).toBe(before)
  })

  // The re-render bug: a fresh array per push woke every subscriber on every
  // console call, even ones reading a single entry that had not changed.
  it('does not notify readers of an entry that a later push did not touch', () => {
    let runs = 0
    const dispose = createRoot((disposeRoot) => {
      createComputed(() => {
        void consoleLogs()[0]?.text
        runs += 1
      })
      return disposeRoot
    })

    pushConsoleEntry('log', ['first'])
    const afterFirst = runs
    pushConsoleEntry('log', ['second'])

    expect(runs).toBe(afterFirst)
    dispose()
  })

  it('does not re-wrap console when the module is re-executed', async () => {
    const first = await import('./console-store')
    first.clearConsoleLogs()
    vi.resetModules()
    const second = await import('./console-store')
    expect(second).not.toBe(first)

    console.log('once')

    expect(first.consoleLogs()).toHaveLength(1)
    expect(second.consoleLogs()).toHaveLength(0)
  })
})
