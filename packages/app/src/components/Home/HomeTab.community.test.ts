import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import homeSource from './HomeTab.tsx?raw'

const homeCss = readFileSync('src/components/Home/HomeTab.module.css', 'utf8')

describe('Home community gallery architecture', () => {
  it('keeps community work out of the editorial wall and on its own rail', () => {
    expect(homeSource).toContain(
      'sections().gallery.filter(isCommunityGalleryItem)',
    )
    expect(homeSource).toContain(
      'sections().gallery.filter((item) => !isCommunityGalleryItem(item))',
    )
    expect(homeSource).toContain('id="home-community-rail"')
    expect(homeSource).toContain('role="region"')
    expect(homeSource).toContain('role="group"')
  })

  it('reuses visibility-gated Plates instead of mounting an eager preview grid', () => {
    const communityRail = homeSource.slice(
      homeSource.indexOf('function CommunityRail'),
      homeSource.indexOf('function Plate'),
    )
    expect(communityRail).toContain('<Plate')
    expect(communityRail).toContain('track={props.track}')
    expect(communityRail).not.toContain('<HomeFlame')
  })

  it('is a bounded horizontal scroller with stable tile dimensions', () => {
    expect(homeCss).toMatch(/\.community-rail\s*\{[\s\S]*overflow-x:\s*auto/u)
    expect(homeCss).toMatch(
      /\.community-rail\s*\{[\s\S]*grid-auto-flow:\s*column/u,
    )
    expect(homeCss).toMatch(/\.community-item\s*\{[\s\S]*height:\s*15rem/u)
  })
})
