import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeTab, setActiveTab } from '@/lib/activeTab'
import { HomeShellBar } from './HomeShellBar'

vi.mock('@/stores/workspaceLayoutStore', () => ({
  isTouchLayout: () => true,
  // The phone bar's layout: the deck layout has the NavRail instead.
  deckFits: () => false,
}))

describe('the shell over Home', () => {
  afterEach(() => {
    cleanup()
    setActiveTab('workspace')
  })

  it('shows Library as the destination you are on, and Create leads back', () => {
    setActiveTab('home')
    render(() => <HomeShellBar />)

    expect(
      screen
        .getByRole('button', { name: 'Library' })
        .getAttribute('aria-current'),
    ).toBe('page')

    screen.getByRole('button', { name: 'Create' }).click()
    expect(activeTab()).toBe('workspace')
  })
})
