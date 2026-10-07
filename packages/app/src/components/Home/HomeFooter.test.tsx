/**
 * Home's footer leaves the app in a new tab. Home sits over the editor, so
 * leaving this tab is a pagehide, and the flush that runs on it may force
 * past a full Recents and drop the oldest kept flame without asking.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { HomeFooter } from './HomeFooter'
import homeTabSource from './HomeTab.tsx?raw'

afterEach(() => {
  cleanup()
})

describe("Home's footer", () => {
  it('opens every link in a new tab', () => {
    render(() => <HomeFooter />)
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'About',
      'Discord',
      'Source',
    ])
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('is the footer Home renders', () => {
    // HomeTab is the whole Home page and cannot be mounted in a unit test.
    expect(homeTabSource).toContain('<HomeFooter />')
    expect(homeTabSource).not.toContain('<footer')
  })
})
