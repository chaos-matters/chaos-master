import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { ArcadeModePanel } from './ArcadeModePanel'

describe('ArcadeModePanel duel setup', () => {
  afterEach(() => {
    cleanup()
    clearWebMcpContext()
  })

  it('says what the duel runs on, and follows the start-from choice', () => {
    // A 3D flame is open: "The flame I have open", the default, is 3D.
    const ctx = createMockCommandContext()
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.dimensions = 3
    }, 'test')
    setWebMcpContext(ctx)
    render(() => <ArcadeModePanel mode="duel" onClose={() => {}} />)

    const pills = screen.getByRole('list', { name: 'Duel setup' })
    const names = () =>
      Array.from(pills.querySelectorAll('li'), (li) => li.textContent?.trim())
    expect(names()).toEqual(['3D', 'Orbit camera per side', '43 variations'])

    const select = screen.getByRole<HTMLSelectElement>('combobox')
    select.value = 'random-2d'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(names()).toEqual(['2D', 'Pan and zoom', '403 variations'])

    select.value = 'random-3d'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(names()).toEqual(['3D', 'Orbit camera per side', '43 variations'])
  })
})
