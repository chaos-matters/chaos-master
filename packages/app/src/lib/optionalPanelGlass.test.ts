/**
 * optionalPanelGlass (lib/glass.ts) against the gate it mirrors: the selector
 * glass.module.css puts in front of optionalPanel. The stylesheet decides
 * which surfaces are glass; the predicate decides what a stylesheet cannot,
 * such as the desktop sidebar floating over the canvas and the share of the
 * canvas the camera frames the flame beside (WorkspaceSidebar/
 * useSidebarGlass.ts). Here the gate's own selector, read from the
 * stylesheet, is matched in the test DOM for each setting and theme, and the
 * predicate has to give the same answer every time: a change to the gate
 * that the predicate does not follow, or the other way round, fails here.
 *
 * Read from disk rather than imported: the test runtime turns a CSS module
 * import into class names. So it is registered in scripts/always-on-tests.mjs.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { blocksOf, readCss } from '@/test/cssModule'
import { glassPanels, optionalPanelGlass, setGlassPanels } from './glass'

const css = readCss('styles/designSystem/glass.module.css')

/** `:global(x)` unwrapped to `x`, as the build does, parentheses balanced. */
function unwrapGlobal(selector: string): string {
  let out = ''
  let i = 0
  while (i < selector.length) {
    if (selector.startsWith(':global(', i)) {
      let depth = 1
      let j = i + ':global('.length
      const start = j
      while (depth > 0 && j < selector.length) {
        if (selector[j] === '(') depth++
        if (selector[j] === ')') depth--
        j++
      }
      out += selector.slice(start, j - 1)
      i = j
    } else {
      out += selector[i]
      i++
    }
  }
  return out
}

/**
 * The gate: the selector of the one rule that makes an optionalPanel glass,
 * the rule that gives it the panel fill.
 */
function gateSelector(): string {
  const glassRules = blocksOf(css).filter(
    (block) =>
      /\.optionalPanel$/.test(block.selector) &&
      block.declarations.some(
        (d) =>
          d.property === 'background' && d.value === 'var(--la-glass-panel)',
      ),
  )
  expect(glassRules).toHaveLength(1)
  return glassRules[0]!.selector
}

afterEach(() => {
  setGlassPanels(true)
  delete document.body.dataset.theme
  document.body.replaceChildren()
})

describe('optionalPanelGlass', () => {
  it('reads the setting and the theme the gate reads', () => {
    expect(gateSelector()).toBe(
      ":global(:root[data-glass-panels='on']) :global(body:not([data-theme='light'])) .optionalPanel",
    )
  })

  it.each([
    { setting: true, theme: 'dark' },
    { setting: true, theme: 'light' },
    { setting: false, theme: 'dark' },
    { setting: false, theme: 'light' },
  ] as const)(
    'agrees with the gate with the setting $setting in the $theme theme',
    ({ setting, theme }) => {
      setGlassPanels(setting)
      document.body.dataset.theme = theme
      const panel = document.createElement('div')
      panel.className = 'optionalPanel'
      document.body.append(panel)

      const selector = unwrapGlobal(gateSelector())
      expect(glassPanels()).toBe(setting)
      expect(optionalPanelGlass(theme)).toBe(panel.matches(selector))
      // The four cases between them take both answers, so neither side can
      // pass by always saying the same thing.
      expect(optionalPanelGlass(theme)).toBe(setting && theme === 'dark')
    },
  )
})
