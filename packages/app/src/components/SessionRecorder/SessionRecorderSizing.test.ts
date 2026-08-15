import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const controlsCss = readFileSync(
  'src/components/SessionRecorder/SessionRecorderControls.module.css',
  'utf8',
)
const dockCss = readFileSync(
  'src/components/SessionRecorder/SessionRecorderDock.module.css',
  'utf8',
)
const libraryCss = readFileSync(
  'src/components/SessionRecorder/SessionLibraryPanel.module.css',
  'utf8',
)
const replayCss = readFileSync(
  'src/components/SessionRecorder/SessionReplayPanel.module.css',
  'utf8',
)

function extractBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) throw new Error(`Missing CSS marker: ${marker}`)

  const start = source.indexOf('{', markerIndex)
  if (start < 0) throw new Error(`Missing block for CSS marker: ${marker}`)

  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue
    depth -= 1
    if (depth === 0) return source.slice(start + 1, index)
  }

  throw new Error(`Unclosed block for CSS marker: ${marker}`)
}

describe('recorder responsive density', () => {
  it('uses one compact coarse-pointer target across recorder surfaces', () => {
    const sources = [controlsCss, dockCss, libraryCss, replayCss]

    expect(dockCss).toContain('--recorder-coarse-target: 2.25rem')
    expect(extractBlock(dockCss, '@media (pointer: coarse)')).toContain(
      'var(--recorder-coarse-target)',
    )
    expect(extractBlock(controlsCss, '@media (pointer: coarse)')).toContain(
      'var(--recorder-coarse-target, 2.25rem)',
    )
    expect(extractBlock(libraryCss, '@media (pointer: coarse)')).toContain(
      'var(--recorder-coarse-target, 2.25rem)',
    )
    expect(extractBlock(replayCss, '@media (pointer: coarse)')).toContain(
      'var(--recorder-coarse-target, 2.25rem)',
    )
    for (const source of sources) expect(source).not.toContain('2.75rem')
  })

  it('grows the touch glyphs without growing the desktop controls', () => {
    expect(extractBlock(controlsCss, '\n.icon-button {')).toContain(
      'width: 1.55rem',
    )
    expect(extractBlock(controlsCss, '\n.icon {')).toContain('width: 0.94rem')
    expect(extractBlock(controlsCss, '@media (pointer: coarse)')).toContain(
      'width: 1rem',
    )
    expect(extractBlock(dockCss, '\n.icon-button {')).toContain(
      'width: 1.55rem',
    )
  })

  it('wraps recording actions only on narrow coarse-pointer screens', () => {
    const tabletBlock = extractBlock(libraryCss, '@media (pointer: coarse) {')
    const phoneBlock = extractBlock(
      libraryCss,
      '@media (pointer: coarse) and (max-width: 28rem)',
    )

    expect(tabletBlock).not.toContain('flex-wrap: wrap')
    expect(phoneBlock).toContain('flex-wrap: wrap')
    expect(phoneBlock).toContain('flex-basis: 100%')
  })
})
