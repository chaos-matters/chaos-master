/**
 * The stylesheet reader the CSS tests share (cssModule.ts), held to its
 * contract on fixtures written here. The stylesheets it reads today do not
 * exercise every rule of it - no rule the component tests look up is
 * nested, for one - so a reader that stopped keeping nested blocks out, or
 * stopped resolving them, would pass every guard built on it. This fails
 * instead.
 *
 * It reads no file: its subject reaches it through the module graph, which
 * is why it is on EXEMPT in scripts/always-on-tests.mjs rather than
 * ALWAYS_ON.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, blocksOf, declarationsFor, escapeRegExp, hookReads, ownDeclarations, splitList, stripComments, subjectOf, } from './cssModule'

const CSS = [
  '/* a comment',
  '   over two lines { } */',
  '.card {',
  '  color: red;',
  '  &:hover { color: blue; }',
  '  .title { font-weight: 600 }',
  '  background: url("a;b.png");',
  '}',
  '@media (min-width: 769px) {',
  '  .card, .other:is(.x, .y) {',
  '    color: green;',
  '  }',
  '}',
  '.tail { color: var(--tail-ink, black); margin: var(--tail-gap) }',
].join('\n')

describe('stripComments', () => {
  it('blanks a comment and keeps its line breaks and its length', () => {
    const out = stripComments(CSS)
    expect(out).not.toMatch(/comment|\{ \}/)
    expect(out).toHaveLength(CSS.length)
    expect(out.split('\n')).toHaveLength(CSS.split('\n').length)
  })
})

describe('blocksOf', () => {
  it('gives every block its line, its own declarations and its selectors', () => {
    const blocks = blocksOf(CSS).map(({ selector, selectors, line }) => ({
      selector,
      selectors,
      line,
    }))
    expect(blocks).toEqual([
      { selector: '.card', selectors: ['.card'], line: 3 },
      { selector: '&:hover', selectors: ['.card:hover'], line: 5 },
      { selector: '.title', selectors: ['.card .title'], line: 6 },
      { selector: '@media (min-width: 769px)', selectors: [], line: 9 },
      {
        selector: '.card, .other:is(.x, .y)',
        selectors: ['.card', '.other:is(.x, .y)'],
        line: 10,
      },
      { selector: '.tail', selectors: ['.tail'], line: 14 },
    ])
    expect(blocksOf(CSS)[0]!.declarations).toEqual([
      { property: 'color', value: 'red', line: 4 },
      { property: 'background', value: 'url("a;b.png")', line: 7 },
    ])
  })
})

describe('blockOf', () => {
  it('is the text of the first block a header opens, nested blocks and all', () => {
    const card = blockOf(CSS, /^\.card\s*\{/m)
    expect(card).toContain('&:hover { color: blue; }')
    expect(card).toContain('background: url("a;b.png");')
    expect(blockOf(CSS, '@media (min-width: 769px) {').trim()).toMatch(
      /^\.card, \.other:is\(\.x, \.y\) \{\s*color: green;\s*\}$/,
    )
  })

  it('fails on a header nothing matches', () => {
    expect(() => blockOf(CSS, /^\.missing\s*\{/m)).toThrow(/\.missing/)
  })
})

describe('ownDeclarations', () => {
  it("leaves a nested block's declarations out", () => {
    const own = ownDeclarations(blockOf(CSS, /^\.card\s*\{/m))
    expect([...own]).toEqual([
      ['color', 'red'],
      ['background', 'url("a;b.png")'],
    ])
  })

  it('keeps the last of a property written twice', () => {
    expect(ownDeclarations('color: red; color: blue').get('color')).toBe('blue')
  })
})

describe('declarationsFor', () => {
  it('is every rule applying to a selector, in any at-rule or nesting', () => {
    expect(declarationsFor(CSS, '.card')).toBe(
      'color: red;\nbackground: url("a;b.png");\ncolor: green;',
    )
    expect(declarationsFor(CSS, '.card:hover')).toBe('color: blue;')
    expect(declarationsFor(CSS, '.card   .title')).toBe('font-weight: 600;')
    expect(declarationsFor(CSS, '.other:is(.x, .y)')).toBe('color: green;')
    expect(declarationsFor(CSS, '.x')).toBe('')
  })

  it('keeps to the rules outside every at-rule when asked to', () => {
    // A guard that pins a declaration on the rule itself must not pass when
    // the declaration moves into an @media block, where it applies only
    // sometimes.
    const topLevel = { topLevel: true }
    expect(declarationsFor(CSS, '.card', topLevel)).toBe(
      'color: red;\nbackground: url("a;b.png");',
    )
    expect(declarationsFor(CSS, '.card:hover', topLevel)).toBe('color: blue;')
    expect(declarationsFor(CSS, '.other:is(.x, .y)', topLevel)).toBe('')
    const nested = '.a { color: red; @media (hover: hover) { color: blue } }'
    expect(declarationsFor(nested, '.a')).toBe('color: red;\ncolor: blue;')
    expect(declarationsFor(nested, '.a', topLevel)).toBe('color: red;')
  })
})

describe('the selector helpers', () => {
  it('cut a list at its own commas and find its subject', () => {
    expect(splitList(':is(.a, .b) .c, [data-x="1,2"]')).toEqual([
      ':is(.a, .b) .c',
      '[data-x="1,2"]',
    ])
    expect(subjectOf("[data-theme='dark'] .a > .b:is(.c .d)")).toBe(
      '.b:is(.c .d)',
    )
    // eslint-disable-next-line security/detect-non-literal-regexp -- the escaping under test
    expect(new RegExp(escapeRegExp('.a[x]:is(*)')).test('.a[x]:is(*)')).toBe(
      true,
    )
  })

  it('find every hook read, with whether it falls back', () => {
    expect(hookReads(CSS, ['tail'])).toEqual([
      { name: '--tail-ink', fallback: true },
      { name: '--tail-gap', fallback: false },
    ])
  })
})
