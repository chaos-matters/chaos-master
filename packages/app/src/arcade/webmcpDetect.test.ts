import { describe, expect, it } from 'vitest'
import { detectWebMcp } from './webmcpDetect'

const fakeWindow = (overrides: Record<string, unknown>) =>
  ({ document: {}, navigator: {}, ...overrides }) as unknown as Window

describe('detectWebMcp', () => {
  it('reports the browser API, the dev mock, or nothing', () => {
    expect(detectWebMcp(fakeWindow({ document: { modelContext: {} } }))).toBe(
      'detected',
    )
    expect(detectWebMcp(fakeWindow({ navigator: { modelContext: {} } }))).toBe(
      'detected',
    )
    expect(detectWebMcp(fakeWindow({ webmcp: {} }))).toBe('mock')
    expect(detectWebMcp(fakeWindow({}))).toBe('none')
  })
})
