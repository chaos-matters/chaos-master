import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import workspaceSource from '../../MainWorkspace.tsx?raw'
import { SoftwareVersion } from './SoftwareVersion'

describe('SoftwareVersion component', () => {
  afterEach(cleanup)

  it('renders collapsed version trigger and expands upward menu on click', () => {
    const showHelp = vi.fn()
    const showDocs = vi.fn()
    const showBenchmark = vi.fn()
    const setPref = vi.fn()

    render(() => (
      <SoftwareVersion
        showHelp={showHelp}
        showDocs={showDocs}
        showBenchmark={showBenchmark}
        setTouchLayoutPreference={setPref}
      />
    ))

    const trigger = screen.getByRole('button', { name: /lumen apeiron.*menu/i })
    expect(trigger).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()

    // Open menu
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()

    const labLink = screen.getByRole('link', { name: 'Open Benchmark Lab' })
    expect(labLink).toBeTruthy()
    expect(labLink.getAttribute('href')).toBe('/benchmarks')

    const arcadeLink = screen.getByRole('link', { name: 'Open Lumen Arcade' })
    expect(arcadeLink).toBeTruthy()

    const docsBtn = screen.getByText('Documentation')
    expect(docsBtn).toBeTruthy()
    fireEvent.click(docsBtn)
    expect(showDocs).toHaveBeenCalled()

    // Reopen menu to click About
    fireEvent.click(trigger)
    const aboutBtn = screen.getByText('Settings and More')
    expect(aboutBtn).toBeTruthy()
    fireEvent.click(aboutBtn)
    expect(showHelp).toHaveBeenCalled()

    // Reopen menu to click Touch
    fireEvent.click(trigger)
    const touchBtn = screen.getByText('Switch to Touch Studio')
    expect(touchBtn).toBeTruthy()
    fireEvent.click(touchBtn)
    expect(setPref).toHaveBeenCalledWith('touch')
  })

  it('triggers quick benchmark, docs, and help from the menu', () => {
    const showHelp = vi.fn()
    const showDocs = vi.fn()
    const showBenchmark = vi.fn()

    render(() => (
      <SoftwareVersion
        showHelp={showHelp}
        showDocs={showDocs}
        showBenchmark={showBenchmark}
      />
    ))

    const trigger = screen.getByRole('button', { name: /lumen apeiron.*menu/i })

    // Benchmark
    fireEvent.click(trigger)
    screen.getByText('Quick GPU Benchmark').click()
    expect(showBenchmark).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()

    // Docs
    fireEvent.click(trigger)
    screen.getByText('Documentation').click()
    expect(showDocs).toHaveBeenCalled()

    // Help
    fireEvent.click(trigger)
    screen.getByText('Settings and More').click()
    expect(showHelp).toHaveBeenCalled()
  })

  it('closes the menu on Escape key', () => {
    render(() => (
      <SoftwareVersion
        showHelp={vi.fn()}
        showDocs={vi.fn()}
        showBenchmark={vi.fn()}
      />
    ))

    const trigger = screen.getByRole('button', { name: /lumen apeiron.*menu/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('where the version menu is offered', () => {
  it('renders no trigger at all where the host hides it', () => {
    // A host that says it carries these items elsewhere is answering for the
    // whole component. The debug panel beside them is unconditional and is
    // not this menu, so the trigger is looked for by name.
    render(() => (
      <SoftwareVersion
        showHelp={vi.fn()}
        showDocs={vi.fn()}
        showBenchmark={vi.fn()}
        hideTrigger={() => true}
      />
    ))

    expect(screen.queryByRole('button', { name: /lumen apeiron/i })).toBeNull()
  })

  it('is hidden by the editor on every touch layout', () => {
    // Gated on `railLayout` this hid on the phone and on a narrow tablet, and
    // showed on the one layout that also mounts the NavRail - a 36px hamburger
    // at 8,8, directly over the rail's Create and Library, opening a second
    // copy of the More list the rail already carries. Read out of the source
    // because mounting the editor is mounting the whole app.
    expect(workspaceSource.replace(/\s+/g, ' ')).toContain(
      'hideVersionTrigger={isTouchLayout}',
    )
  })
})
