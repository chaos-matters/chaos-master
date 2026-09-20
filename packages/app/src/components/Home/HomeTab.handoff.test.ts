import { describe, expect, it } from 'vitest'
import source from './HomeTab.tsx?raw'

/**
 * A gallery flame opens at the timeline it was authored at.
 *
 * The hand-off carries the flame, its keyframes and its timeline, and the
 * three travel together or the animation resumes at the workspace's defaults -
 * 30fps over 90 frames - however long the row actually is. HomeTab is the
 * whole Home page and cannot be mounted in a unit test, so the rule is read
 * out of the source the way the community rail's is
 * (HomeTab.community.test.ts).
 */
const code = source.replace(/\s+/g, ' ')

describe('opening a gallery flame', () => {
  it('hands over the timeline beside the keyframes', () => {
    // `config` used to be dropped here while `tracks` went through, so a row
    // submitted as a 60fps, 300-frame loop opened as a 30fps, 90-frame one.
    expect(code).toContain('item.animation?.tracks,')
    expect(code).toContain('const stored = item.animation?.config')
    expect(code).toContain(
      'stored ? { ...defaultConfig(), ...stored } : undefined,',
    )
  })

  it('leaves a row with no stored timeline exactly as it was', () => {
    // The editorial seed writes tracks and no config
    // (scripts/seed-gallery.mjs), and a row with a half-built timeline would
    // be worse than one with none: those keep opening at the workspace's own.
    expect(code).toContain('config?: TimelineConfig,')
  })
})
