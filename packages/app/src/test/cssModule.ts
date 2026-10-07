/**
 * The app's stylesheets as the tests that hold them read them: from disk,
 * since the test runtime turns a CSS module import (`?raw` included) into
 * class names, and cut into blocks with a small reader of its own rather
 * than a CSS parser, which the app does not depend on.
 *
 * One reader for every such test, the glass guards and the component
 * `*.module.test.ts` files alike, so a nesting form it learns reaches all of
 * them at once and each reads a rule the same way:
 *
 *   - comments are blanked with their line breaks kept, so a line number or
 *     an offset in the read text is one in the file;
 *   - `blockOf` is the text of the first block a header opens, nested
 *     blocks included; `ownDeclarations` a block's own, nested left out;
 *   - `declarationsFor` is every declaration any rule applies to a
 *     selector, in document order, whatever at-rule or nesting it is in,
 *     or with `topLevel` only the rules outside every at-rule.
 *
 * A test that reads a file through this module reaches the tree without an
 * import edge, so it belongs on the always-on list
 * (scripts/always-on-tests.mjs), and alwaysOnTestList.test.ts follows its
 * import here to say so.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect } from 'vitest'

/** packages/app/src, which every path here is relative to. */
export const SRC = join(import.meta.dirname, '..')

export interface Declaration {
  property: string
  value: string
  line: number
}

export interface Block {
  /** The selector as written: `&:hover` in a nested rule, `@media ...`. */
  selector: string
  /**
   * The selectors the block's declarations apply to, the parents' written
   * in for `&` (or in front of it, where a nested selector has none). An
   * at-rule applies to its parent's; at the top level, to none.
   */
  selectors: string[]
  /**
   * The block is an at-rule, or an at-rule holds it at any depth: its
   * declarations apply only when that @media, @supports or the like does.
   */
  conditional: boolean
  line: number
  declarations: Declaration[]
}

/**
 * `css` with every comment blanked: each character but a line break turns
 * into a space, so offsets and line numbers stay those of the file.
 */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  )
}

/** A file under packages/app/src, `/`-separated, with its comments blanked. */
export function readCss(path: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path under packages/app/src, in this repo
  return stripComments(readFileSync(join(SRC, ...path.split('/')), 'utf8'))
}

/** `text` with every regular-expression metacharacter escaped. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Every block of a stylesheet, each with the declarations written directly
 * in it: a nested rule is a block of its own, so a twin inside `&:hover`
 * does not count for the rule around it. Comments are blanked with their
 * line breaks kept, and nothing inside quotes or parentheses - a url(), an
 * @supports test - ends a declaration or opens a block. The last
 * declaration of a block may go without its semicolon.
 */
export function blocksOf(css: string): Block[] {
  const src = stripComments(css)
  const blocks: Block[] = []
  const open: Block[] = []
  let text = ''
  let textLine = 1
  let line = 1
  let parens = 0
  let quote = ''

  const endStatement = () => {
    const statement = text.trim()
    const colon = statement.indexOf(':')
    const block = open.at(-1)
    if (block && colon > 0) {
      block.declarations.push({
        property: statement.slice(0, colon).trim().toLowerCase(),
        value: statement
          .slice(colon + 1)
          .trim()
          .replace(/\s+/g, ' '),
        line: textLine,
      })
    }
    text = ''
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (ch === '\n') line++
    if (!text.trim() && ch.trim()) textLine = line
    if (quote) {
      text += ch
      if (ch === quote && src[i - 1] !== '\\') quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
      text += ch
    } else if (ch === '(' || ch === ')') {
      parens += ch === '(' ? 1 : -1
      text += ch
    } else if (parens > 0) {
      text += ch
    } else if (ch === '{') {
      const selector = text.trim().replace(/\s+/g, ' ')
      const parent = open.at(-1)
      const block: Block = {
        selector,
        selectors: resolve(selector, parent?.selectors ?? []),
        conditional: isConditional(selector, parent),
        line: textLine,
        declarations: [],
      }
      blocks.push(block)
      open.push(block)
      text = ''
    } else if (ch === '}') {
      endStatement()
      open.pop()
    } else if (ch === ';') {
      endStatement()
    } else {
      text += ch
    }
  }
  return blocks
}

/** Whether a block opened by `selector` inside `parent` is an at-rule's. */
function isConditional(selector: string, parent: Block | undefined): boolean {
  return selector.startsWith('@') || parent?.conditional === true
}

/** A block's selectors, from its own and its parent's. */
function resolve(selector: string, parents: string[]): string[] {
  if (selector.startsWith('@')) return parents
  const own = splitList(selector)
  if (!parents.length) return own
  return parents.flatMap((parent) =>
    own.map((s) =>
      s.includes('&') ? s.replaceAll('&', parent) : `${parent} ${s}`,
    ),
  )
}

/** A selector list cut at its top-level commas. */
export function splitList(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(selector.slice(start).trim())
  return parts.filter(Boolean)
}

/**
 * The compound a selector styles, its last: `.b:hover` of
 * `[data-theme='dark'] .a > .b:hover`.
 */
export function subjectOf(selector: string): string {
  let depth = 0
  for (let i = selector.length - 1; i >= 0; i--) {
    const ch = selector[i]!
    if (ch === ')' || ch === ']') depth++
    else if (ch === '(' || ch === '[') depth--
    else if (depth === 0 && /[\s>+~]/.test(ch)) return selector.slice(i + 1)
  }
  return selector
}

/**
 * The text between the braces of the first block whose header matches: the
 * block the first brace at or after the match opens, nested blocks and all.
 * A string header is matched as written. Comments are blanked first.
 */
export function blockOf(css: string, header: RegExp | string): string {
  const src = stripComments(css)
  const at =
    typeof header === 'string' ? src.indexOf(header) : src.search(header)
  const match = at < 0 ? null : at
  expect(match, String(header)).not.toBeNull()
  const open = src.indexOf('{', match!)
  let depth = 0
  for (let i = open; open >= 0 && i < src.length; i++) {
    if (src[i] === '{') depth++
    if (src[i] === '}') depth--
    if (depth === 0) return src.slice(open + 1, i)
  }
  throw new Error(`unclosed block after ${String(header)}`)
}

/**
 * The declarations written directly in a block's text (what blockOf
 * returns), property to value with spaces folded: nested blocks are left
 * out, and of a property written twice the last wins, as in the cascade.
 */
export function ownDeclarations(block: string): Map<string, string> {
  const [own] = blocksOf(`{${block}}`)
  return new Map(own!.declarations.map((d) => [d.property, d.value]))
}

export interface DeclarationsForOptions {
  /**
   * Only the rules outside every at-rule: what the selector always gets,
   * for a guard that pins a declaration on the rule itself and must fail
   * when it moves into an @media block. Off by default.
   */
  topLevel?: boolean
}

/**
 * Every declaration a rule applies to `selector`, as `property: value;`
 * lines in document order: each rule whose selector list, nesting resolved
 * and spaces folded, holds `selector` exactly, in any at-rule unless
 * `topLevel` asks for the rules outside them only. Empty when no rule does.
 */
export function declarationsFor(
  css: string,
  selector: string,
  { topLevel = false }: DeclarationsForOptions = {},
): string {
  const wanted = selector.trim().replace(/\s+/g, ' ')
  return blocksOf(css)
    .filter((block) => !(topLevel && block.conditional))
    .filter((block) => block.selectors.includes(wanted))
    .flatMap((block) => block.declarations)
    .map(({ property, value }) => `${property}: ${value};`)
    .join('\n')
}

/**
 * Every read of a custom-property hook named `--<prefix>-*`, for each of
 * `prefixes`, with whether the read carries a fallback.
 */
export function hookReads(
  css: string,
  prefixes: string[],
): { name: string; fallback: boolean }[] {
  // eslint-disable-next-line security/detect-non-literal-regexp -- hook prefixes a test passes
  const hook = new RegExp(
    String.raw`var\(\s*(--(?:${prefixes.join('|')})-[\w-]+)\s*([,)])`,
    'g',
  )
  return [...css.matchAll(hook)].map(([, name, next]) => ({
    name: name!,
    fallback: next === ',',
  }))
}

/** Every file under `dir` whose name passes `test`. */
export function filesUnder(
  dir: string,
  test: (name: string) => boolean,
): string[] {
  const out: string[] = []
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a directory under packages/app/src, in this repo
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- an entry of that directory
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, test))
    else if (test(name)) out.push(full)
  }
  return out
}

export interface Stylesheet {
  /** The path under packages/app/src, with forward slashes. */
  file: string
  raw: string
  /** `raw` with its comments blanked and their line breaks kept. */
  css: string
}

/** Every stylesheet under packages/app/src. */
export function readStylesheets(): Stylesheet[] {
  return filesUnder(SRC, (name) => name.endsWith('.css')).map((full) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a stylesheet filesUnder listed
    const raw = readFileSync(full, 'utf8')
    return {
      file: relative(SRC, full).split('\\').join('/'),
      raw,
      css: stripComments(raw),
    }
  })
}
