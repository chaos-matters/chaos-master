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

  // The store migration would regress here if <For> or the header stopped
  // tracking the array: the panel is usually already open when a log arrives.
  it('picks up an entry logged while it is open', async () => {
    const panel = render(() => <ConsoleLog />)
    expect(panel.container.textContent).toContain('Console (0)')

    pushConsoleEntry('error', ['arrived later'])

    await panel.findByText(/arrived later/)
    expect(panel.container.textContent).toContain('Console (1)')
  })

  it('empties itself when the logs are cleared while it is open', async () => {
    pushConsoleEntry('log', ['transient'])
    const panel = render(() => <ConsoleLog />)
    expect(panel.container.textContent).toContain('transient')

    clearConsoleLogs()

    await panel.findByText('No console output yet.')
    expect(panel.container.textContent).toContain('Console (0)')
  })

  it('counts the entries it renders', () => {
    pushConsoleEntry('log', ['one'])
    pushConsoleEntry('error', ['two'])

    const { container } = render(() => <ConsoleLog />)

    expect(container.textContent).toContain('Console (2)')
  })
})
