import { describe, expect, it } from 'vitest'
import { apiUrl, IS_NATIVE, publicOrigin } from './platform'

// The web build (and vitest) sets neither VITE_API_ORIGIN nor
// VITE_PUBLIC_ORIGIN, so the web keeps its relative, same-origin behaviour.
describe('platform (web build)', () => {
  it('is not a native build', () => {
    expect(IS_NATIVE).toBe(false)
  })

  it('keeps API paths relative', () => {
    expect(apiUrl('/api/gallery/config')).toBe('/api/gallery/config')
  })

  it('uses the current origin for public links', () => {
    expect(publicOrigin()).toBe(globalThis.location.origin)
  })
})
