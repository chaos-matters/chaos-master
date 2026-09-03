import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearConsoleLogs, pushConsoleEntry } from '@/stores/console-store'
import { ConsoleLog } from './ConsoleLog'

describe('ConsoleLog', () => {
  beforeEach(() => {
    clearConsoleLogs()
  })

  afterEach(() => {
    cleanup()
    clearConsoleLogs()
  })

  it('shows the snapshot taken at log time, not the value as it is now', () => {
    const live = { state: 'before' }
    pushConsoleEntry('warn', ['adapter', live])
    live.state = 'after'

    const { container } = render(() => <ConsoleLog />)

    expect(container.textContent).toContain('"state": "before"')
    expect(container.textContent).not.toContain('after')
  })

  it('counts the entries it renders', () => {
    pushConsoleEntry('log', ['one'])
    pushConsoleEntry('error', ['two'])

    const { container } = render(() => <ConsoleLog />)

    expect(container.textContent).toContain('Console (2)')
  })
})
