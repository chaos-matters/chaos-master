import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { webMcpStatusLabel, WebMcpStatusPill } from './WebMcpStatusPill'

const withMock = (installed: boolean) => {
  const win = window as unknown as { webmcp?: unknown }
  if (installed) win.webmcp = {}
  else delete win.webmcp
}

describe('webMcpStatusLabel', () => {
  it('names the dev mock only in a development build', () => {
    expect(webMcpStatusLabel('mock', true)).toBe('WebMCP dev mock active')
    expect(webMcpStatusLabel('mock', false)).toBe(
      'WebMCP not detected in this browser',
    )
  })

  it('words the other two states the same either way', () => {
    for (const isDev of [true, false]) {
      expect(webMcpStatusLabel('detected', isDev)).toBe('WebMCP detected')
      expect(webMcpStatusLabel('none', isDev)).toBe(
        'WebMCP not detected in this browser',
      )
    }
  })
})

describe('WebMcpStatusPill', () => {
  afterEach(() => {
    cleanup()
    withMock(false)
  })

  it('publishes the raw state so tests can still see the mock', () => {
    withMock(true)
    render(() => <WebMcpStatusPill />)

    // The label softens in production, but `data-state` never does: Playwright
    // and the console read this, not the copy.
    expect(screen.getByTestId('webmcp-status').dataset.state).toBe('mock')
  })

  it('does not call the fallback a dev mock in a production build', () => {
    vi.stubEnv('DEV', false)
    withMock(true)
    render(() => <WebMcpStatusPill />)

    expect(screen.getByTestId('webmcp-status').textContent).toContain(
      'WebMCP not detected in this browser',
    )
    expect(screen.getByTestId('webmcp-status').textContent).not.toContain(
      'dev mock',
    )
    vi.unstubAllEnvs()
  })

  it('keeps the browser instructions next to the label', () => {
    render(() => <WebMcpStatusPill />)

    const body = screen.getByTestId('webmcp-status').textContent ?? ''
    expect(body).toContain("ChatGPT's desktop browser")
    expect(body).toContain('Chrome 149+')
    expect(body).toContain('chrome://flags/#enable-webmcp-testing')
  })
})
