/**
 * onGlass, the look the editor's shared components take on glass
 * (glass.module.css; docs/plans/glass-panels.md, decision c).
 *
 * ControlCard, CollapsibleCard, the Slider and the PaletteSelector are
 * written for the editor's opaque sidebar, where their quieter text is fine.
 * On an 80% panel over art that can be white-hot, that text measured 2.39 to
 * 3.98:1 (the explorer's panel). Their stylesheets therefore read
 * custom-property hooks, --card-*, --slider-* and --palette-*, which onGlass
 * sets for every glass surface that composes it (glassSurfaces.test.ts says
 * which do, and that nothing else sets them).
 *
 * The test DOM applies no CSS, so this reads the stylesheets and holds the
 * arrangement in place:
 *
 *   - every hook a component reads has a fallback, the look it had before
 *     the hook, so the opaque sidebar, which sets none, looks as it did;
 *   - onGlass sets exactly the hooks the components read, so no text is
 *     left at its sidebar colour on the glass;
 *   - each hook is set to one --la-* token, or clear, and the ink hooks,
 *     which colour text, to ink or ink-2: the tiers an 80% fill allows.
 *
 * Read from disk rather than imported: the test runtime turns a CSS module
 * import into class names. So it is registered in scripts/always-on-tests.mjs.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, hookReads, ownDeclarations, readCss as read, } from '@/test/cssModule'

const COMPONENTS = [
  'components/ControlCard/ControlCard.module.css',
  'components/CollapsibleCard/CollapsibleCard.module.css',
  'components/Sliders/Slider.module.css',
  'components/PaletteSelector/PaletteSelector.module.css',
]

/** Every hook read, with whether that read carries a fallback. */
const reads = COMPONENTS.flatMap((file) =>
  hookReads(read(file), ['card', 'slider', 'palette']).map(
    ({ name, fallback }) => ({ file, hook: name, fallback }),
  ),
)

const glass = read('styles/designSystem/glass.module.css')

/** The custom properties onGlass's one rule sets. */
const onGlass = new Map(
  [
    ...ownDeclarations(blockOf(glass, /:where\(\.onGlass\):not\(html\)\s*\{/)),
  ].filter(([hook]) => hook.startsWith('--')),
)

describe('onGlass', () => {
  it('finds the hooks in every component and in its one rule', () => {
    expect(new Set(reads.map(({ file }) => file))).toEqual(new Set(COMPONENTS))
    expect(onGlass.size).toBeGreaterThan(0)
    // The rule is the only one that names it, so nothing in the file can
    // raise it over a surface's own declaration or take a hook away.
    expect(glass.match(/\.onGlass\b/g)).toHaveLength(1)
  })

  it('leaves the opaque look wherever a hook is read', () => {
    const bare = reads
      .filter(({ fallback }) => !fallback)
      .map(({ file, hook }) => `${file} reads ${hook} with no fallback`)
    expect(bare).toEqual([])
  })

  it('sets exactly the hooks the components read', () => {
    expect([...onGlass.keys()].sort()).toEqual(
      [...new Set(reads.map(({ hook }) => hook))].sort(),
    )
  })

  it('sets each hook to a token, and text only to ink or ink-2', () => {
    const wrong: string[] = []
    for (const [hook, value] of onGlass) {
      if (!/^(var\(--la-[\w-]+\)|transparent)$/.test(value)) {
        wrong.push(`${hook} is ${value}, not one --la-* token`)
      } else if (
        /-ink(?:-|$)/.test(hook) &&
        !['var(--la-ink)', 'var(--la-ink-2)'].includes(value)
      ) {
        wrong.push(`${hook} colours text on 80% glass and is ${value}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('writes a targeted slider in ink on glass, and the accent elsewhere', () => {
    // A slider the keyboard or a controller has targeted writes its label
    // in the accent, 3.55:1 at worst on the panel over white-hot art. On
    // glass it takes ink; the accent stays in its edge and its wash.
    expect(read('components/Sliders/Slider.module.css')).toMatch(
      /\.label\.targeted span\s*\{[^}]*color:\s*var\(--slider-ink-targeted,\s*var\(--accent-color,\s*#3b82f6\)\);/,
    )
    expect(onGlass.get('--slider-ink-targeted')).toBe('var(--la-ink)')
  })
})
