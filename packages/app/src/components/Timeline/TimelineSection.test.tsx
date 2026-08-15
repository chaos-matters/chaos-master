import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { TimelineContextProvider } from '@/contexts/TimelineContext'
import { createTimelineState } from '@/utils/timeline'
import { TimelineSection } from './TimelineSection'

describe('TimelineSection controlled collapse', () => {
  it('lets workspace-owned state reveal a collapsed dope sheet', () => {
    const timeline = createTimelineState()
    const [collapsed, setCollapsed] = createSignal(true)
    const { unmount } = render(() => (
      <TimelineContextProvider value={timeline}>
        <TimelineSection collapsed={collapsed} setCollapsed={setCollapsed} />
      </TimelineContextProvider>
    ))

    expect(document.querySelector('[data-tour-target="dope-sheet"]')).toBeNull()

    setCollapsed(false)

    expect(collapsed()).toBe(false)
    expect(
      document.querySelector('[data-tour-target="dope-sheet"]'),
    ).not.toBeNull()

    fireEvent.click(screen.getByTestId('timeline-collapse'))
    expect(collapsed()).toBe(true)

    unmount()
  })
})
