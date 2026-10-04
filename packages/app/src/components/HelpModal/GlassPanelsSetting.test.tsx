/**
 * The Glass panels row in Settings: on by default, offered on every layout,
 * and the one place a user turns the setting off or back on. Whether the
 * system's preferences let the glass show is lib/glass.test.ts's; here it
 * is a switch the test sets.
 */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { glassPanels, setGlassPanels } from '@/lib/glass'
import { GlassPanelsSetting } from './GlassPanelsSetting'
import type * as Glass from '@/lib/glass'

const LABEL = 'Glass panels'
const HINT =
  'Frosted glass over the artwork. Turn it off if the frame rate drops.'
const BLOCKED =
  'Solid while your system asks for reduced transparency or more contrast.'

/** Whether the system asks for less transparency or more contrast. */
interface System {
  blocks: () => boolean
}

const system = vi.hoisted<System>(() => ({ blocks: () => false }))
vi.mock('@/lib/glass', async (importOriginal) => {
  const glass = await importOriginal<typeof Glass>()
  return {
    ...glass,
    glassAllowed: () => glass.glassPanels() && !system.blocks(),
  }
})

describe('the Glass panels setting row', () => {
  afterEach(() => {
    cleanup()
    setGlassPanels(true)
    system.blocks = () => false
  })

  it('offers the setting, on, with what turning it off buys', () => {
    render(() => <GlassPanelsSetting />)

    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: LABEL })
    expect(box.checked).toBe(true)
    expect(screen.getByText(HINT)).toBeTruthy()
  })

  it('turns the setting off and on, and <html> follows', () => {
    render(() => <GlassPanelsSetting />)
    const box = screen.getByRole('checkbox', { name: LABEL })

    fireEvent.click(box)
    expect(glassPanels()).toBe(false)
    expect(document.documentElement.hasAttribute('data-glass-panels')).toBe(
      false,
    )

    fireEvent.click(box)
    expect(glassPanels()).toBe(true)
    expect(document.documentElement.getAttribute('data-glass-panels')).toBe(
      'on',
    )
  })

  it('shows a setting turned off elsewhere as unchecked', () => {
    setGlassPanels(false)
    render(() => <GlassPanelsSetting />)

    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: LABEL })
    expect(box.checked).toBe(false)
  })

  it('says why the panels are solid while the system asks for it', () => {
    const [blocks, setBlocks] = createSignal(true)
    system.blocks = blocks
    render(() => <GlassPanelsSetting />)

    // The box keeps the choice, for when the system setting goes.
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: LABEL })
    expect(box.checked).toBe(true)
    expect(screen.getByText(BLOCKED)).toBeTruthy()
    expect(screen.queryByText(HINT)).toBeNull()

    setBlocks(false)
    expect(screen.getByText(HINT)).toBeTruthy()
    expect(screen.queryByText(BLOCKED)).toBeNull()
  })

  it('keeps its usual hint when the setting is off anyway', () => {
    system.blocks = () => true
    setGlassPanels(false)
    render(() => <GlassPanelsSetting />)

    expect(screen.getByText(HINT)).toBeTruthy()
  })
})
