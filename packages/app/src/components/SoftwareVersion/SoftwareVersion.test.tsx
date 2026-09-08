import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SoftwareVersion } from './SoftwareVersion'

describe('SoftwareVersion component', () => {
  afterEach(cleanup)

  it('renders collapsed version trigger and expands upward menu on click in desktop layout', () => {
    const showHelp = vi.fn()
    const showDocs = vi.fn()
    const showBenchmark = vi.fn()
    const setPref = vi.fn()

    render(() => (
      <SoftwareVersion
        showHelp={showHelp}
        showDocs={showDocs}
        showBenchmark={showBenchmark}
        touchLayoutPreference={() => 'desktop'}
        setTouchLayoutPreference={setPref}
        isTouchLayout={() => false}
      />
    ))

    const trigger = screen.getByRole('button', { name: /chaos master.*menu/i })
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

  it('renders collapsed trigger and expands upward menu on click in touch layout', () => {
    const showHelp = vi.fn()
    const showDocs = vi.fn()
    const showBenchmark = vi.fn()
    const setPref = vi.fn()

    render(() => (
      <SoftwareVersion
        showHelp={showHelp}
        showDocs={showDocs}
        showBenchmark={showBenchmark}
        touchLayoutPreference={() => 'touch'}
        setTouchLayoutPreference={setPref}
        isTouchLayout={() => true}
      />
    ))

    const trigger = screen.getByRole('button', { name: /chaos master menu/i })
    expect(trigger).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()

    // Open menu
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByText('Switch to Desktop Layout')).toBeTruthy()
    expect(screen.getByText('Lumen Arcade')).toBeTruthy()
    expect(screen.getByText('Benchmark Lab')).toBeTruthy()
    expect(screen.getByText('Quick GPU Benchmark')).toBeTruthy()
    expect(screen.getByText('Documentation')).toBeTruthy()
    expect(screen.getByText('Settings and More')).toBeTruthy()

    // Test switch to desktop layout
    screen.getByText('Switch to Desktop Layout').click()
    expect(setPref).toHaveBeenCalledWith('desktop')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('triggers quick benchmark, docs, and help from touch menu', () => {
    const showHelp = vi.fn()
    const showDocs = vi.fn()
    const showBenchmark = vi.fn()

    render(() => (
      <SoftwareVersion
        showHelp={showHelp}
        showDocs={showDocs}
        showBenchmark={showBenchmark}
        isTouchLayout={() => true}
      />
    ))

    const trigger = screen.getByRole('button', { name: /chaos master menu/i })

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

  it('closes touch menu on Escape key', () => {
    render(() => (
      <SoftwareVersion
        showHelp={vi.fn()}
        showDocs={vi.fn()}
        showBenchmark={vi.fn()}
        isTouchLayout={() => true}
      />
    ))

    const trigger = screen.getByRole('button', { name: /chaos master menu/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
