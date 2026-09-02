import { describe, expect, it } from 'vitest'
import { arcadeModeFromHash, tabFromHash } from './activeTab'

describe('tab routing by fragment', () => {
  it('maps hashes to tabs', () => {
    expect(tabFromHash('')).toBe('workspace')
    expect(tabFromHash('#home')).toBe('home')
    expect(tabFromHash('#arcade')).toBe('arcade')
    expect(tabFromHash('#arcade=teach')).toBe('arcade')
    expect(tabFromHash('#arcadex')).toBe('workspace')
  })
  it('extracts only valid arcade modes', () => {
    expect(arcadeModeFromHash('#arcade=cinema')).toBe('cinema')
    expect(arcadeModeFromHash('#arcade=bogus')).toBeUndefined()
    expect(arcadeModeFromHash('#arcade')).toBeUndefined()
  })
})
