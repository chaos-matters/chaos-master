#!/usr/bin/env node
// ============================================================
// Doc citation checker
// ============================================================
//
// Fails when a `file:line` citation in a document no longer points at what it
// cites. Line numbers rot silently: a doc that says `MainWorkspace.tsx:3264`
// keeps saying it while that line moves to 3799, and nothing reads the doc
// against the code again. Every citation therefore names a SYMBOL, and the
// symbol must still be at the cited line, give or take WINDOW lines.
//
//   node scripts/check-doc-citations.mjs            # check every tracked .md
//   node scripts/check-doc-citations.mjs a.md b.md  # check these only
//   node scripts/check-doc-citations.mjs --json     # machine-readable result
//   node scripts/check-doc-citations.mjs --stats    # counts per document
//
// Exit 0 when every checked citation holds, and 1 when one does not,
// including a citation pinned to a revision this clone lacks (CI checks out
// full history for that reason). Exit 2 when the check itself cannot run: a
// named document that cannot be read, or no git.
//
// The rules, in full (docs/agent/CONVENTIONS.md section 9 says the same):
//
// 1. SYNTAX. A citation is `<path>:<lines>`. <path> is a file name or a
//    relative path ending in one of CODE_EXT, and <lines> is `12`, `12-20`,
//    or a comma list without spaces, `12,40-44,97`. Backticks around it are
//    optional. `:<lines>` alone, in backticks, continues the file named
//    last before it in the same paragraph, by a citation or by a code span
//    holding only a path (`MainWorkspace.tsx` ... `:390-427`); with no file
//    before it, it is not a citation (`:8787` is a port). Citations inside
//    fenced code blocks and HTML comments are not citations. A path under
//    node_modules/ or dist/ is third-party and skipped.
//
// 2. RESOLUTION. <path> must match exactly one tracked file, either as the
//    whole repo-relative path or as a suffix after a `/`. No match is an
//    error (the file was deleted or renamed); two or more is an error too
//    (write more of the path). Every cited line must exist in the file.
//
// 3. SYMBOL. The citation's symbol is the code span directly beside it: the
//    first `code span` after it, or the last one before it, with nothing in
//    between but whitespace, the punctuation `( ) , : -` and at most one word
//    (`MainWorkspace.tsx:3271` passes `hideMobileSidebarToggle`, or
//    `isTouchDevice()` at `:28-40`). A span that is a path or a revision
//    (`v0.9.11`, a commit hash) is never a symbol. Citations separated only
//    by commas, spaces or "and" form a group and share the symbols beside
//    the group.
//    The citation holds when, for every cited range, one of the identifiers
//    in its symbol (3+ characters, not a keyword) appears as a whole word on
//    a line of that range or within WINDOW lines of it. For a test file, a
//    "double-quoted title" directly after the citation is a symbol too, and
//    holds when that title appears in the window, or matches an `it.each`
//    title template there (`%s` stands for any text). Titles are not shared
//    across a group: each test citation carries its own.
//
// 4. NO SYMBOL. A citation with no symbol beside it is an error in a living
//    document: it cannot be checked, and an unchecked citation is how the
//    ones this script was written for went stale unnoticed. Name the symbol,
//    or pin the citation to the revision it describes (rule 5).
//
// 5. HISTORY. A citation that describes code as it was, not as it is, is
//    checked against that revision instead of the working tree, where it
//    cannot drift, so it needs no symbol (one given is still checked):
//      - inline: a commit right before the path, inside the span or outside
//        it: 84ae0286 `focus.ts:181-437`, `a5c2f26f x.ts:9`, or
//        `a5c2f26f:packages/app/src/x.ts:9`;
//      - a region: `<!-- cite-check: pinned <rev> -->` up to the next
//        `<!-- cite-check: live -->` or the end of the file.
//    The file must exist at <rev> and every cited line must exist in it.
//    <rev> is a commit hash. A tag is refused, with the commit it names: the
//    fork's remote has no tags, so a tag pin that holds here fails in CI.
//
// 6. OPT-OUT. A whole document is historical, and not checked at all, when
//    it is a changelog (file name contains "changelog"), lives under an
//    `archive/` directory, carries a date in its file name (`2026-09-10-...`,
//    `...-2026-07.md`: dated plans, reports and audits describe the tree of
//    their day), or says `<!-- cite-check: historical <reason> -->` in its
//    first 10 lines. A region inside a living document opts out with
//    `<!-- cite-check: skip <reason> -->` up to the next `live` marker; the
//    reason is required. Prefer a pin: a skipped region is never checked.
// ============================================================

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

export const WINDOW = 5

export const CODE_EXT = [
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'wgsl',
  'json',
  'jsonc',
  'yml',
  'yaml',
  'html',
  'astro',
  'sql',
  'txt',
  'sh',
  'toml',
]

const PATH_RE = String.raw`(?:[\w.@-]+/)*[\w.@-]+\.(?:${CODE_EXT.join('|')})`
const LINES_RE = String.raw`\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*`
const CITATION = new RegExp(
  String.raw`(?<![\w/.@-])(${PATH_RE}):(${LINES_RE})(?![\w-])`,
  'g',
)
const CONTINUATION = new RegExp(String.raw`\`:(${LINES_RE})\``, 'g')
// A revision right before a path pins it: a5c2f26f `a.ts:3`, `a5c2f26f a.ts:3`,
// `a5c2f26f` `a.ts:3` or `a5c2f26f:a.ts:3`. A tag is read too, so that the
// check can refuse it by name.
const PIN_BEFORE =
  /(?:^|[\s(`])(v\d+\.\d+\.\d+(?:-[\w.]+)?|[0-9a-f]{7,40})\^?(?::|`?[ \t]+`?)$/
const MARKER =
  /<!--\s*cite-check:\s*(historical|pinned|live|skip)\b\s*(.*?)\s*-->/
const THIRD_PARTY = /^(?:node_modules|dist)\//
const PATHLIKE = new RegExp(
  String.raw`^(?:[\w.@-]+/)+[\w.@-]*$|^[\w.@-]+\.(?:${CODE_EXT.join('|')}|md)$`,
)
const PATH_ONLY = new RegExp(String.raw`^${PATH_RE}$`)
const REVISION = /^(?:v\d+\.\d+\.\d+(?:-[\w.]+)?|[0-9a-f]{7,40})$/

// Identifiers too generic to identify a line.
const STOP = new Set(
  (
    'abstract any args as async await boolean break case catch children class ' +
    'const continue ctx data default delete div do else enum export extends ' +
    'false finally for from function get id if implements import in ' +
    'instanceof interface is key let new null number object of private ' +
    'props protected public readonly return set span static string super ' +
    'switch this throw true try type typeof undefined unknown value var void ' +
    'while with yield'
  ).split(' '),
)

/** Identifier-like words of a code span: `ui.tabletLayout` -> ['tabletLayout']. */
export function symbolWords(code) {
  const words = code.match(/[A-Za-z_$][\w$]*(?:-[A-Za-z0-9_$]+)*/g) ?? []
  return [...new Set(words.filter((w) => w.length >= 3 && !STOP.has(w)))]
}

/** `12,40-44` -> [[12, 12], [40, 44]] */
export function parseLines(spec) {
  return spec.split(',').map((part) => {
    const [a, b] = part.split('-').map(Number)
    return [a, b ?? a]
  })
}

export function isHistoricalPath(path) {
  const name = path.split('/').pop() ?? path
  return (
    /changelog/i.test(name) ||
    /(^|\/)archive\//.test(path) ||
    /(?:^|[^\d])\d{4}-\d{2}(?:-\d{2})?(?:[^\d]|$)/.test(name)
  )
}

/**
 * Splits markdown into blocks: paragraphs, list items, table rows, headings,
 * with blockquote markers removed. Fenced code and HTML comments are dropped (a comment's cite-check marker is
 * returned as its own block). Each block keeps the source line of every
 * character so a finding can name its line.
 */
export function blocks(markdown) {
  const out = []
  let cur = null
  let fence = null
  let inComment = false
  const flush = () => {
    if (cur) out.push(cur)
    cur = null
  }
  markdown.split('\n').forEach((source, idx) => {
    const lineNo = idx + 1
    // A blockquote's `>` markers are layout, not text: a note quoted over
    // several lines is one paragraph.
    const raw = source.replace(/^\s*(?:>\s?)+/, '')
    const fenceMatch = raw.match(/^\s*(```+|~~~+)/)
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      )
        fence = null
      return
    }
    if (fenceMatch) {
      flush()
      fence = fenceMatch[1]
      return
    }
    let line = raw
    // Markup inside a code span is text: `<!-- cite-check: live -->` written
    // in backticks documents a marker, it is not one.
    if (inComment) {
      const end = maskCode(line).indexOf('-->')
      if (end === -1) return
      line = line.slice(end + 3)
      inComment = false
    }
    const marker = maskCode(line).match(MARKER)
    if (marker) {
      flush()
      out.push({ marker: marker[1], arg: marker[2], line: lineNo })
      return
    }
    // Drop inline comments, and open a multi-line one.
    line = withoutComments(line)
    const open = maskCode(line).indexOf('<!--')
    if (open !== -1) {
      line = line.slice(0, open)
      inComment = true
    }
    if (line.trim() === '') {
      flush()
      return
    }
    const startsBlock = /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|\|)/.test(line)
    if (startsBlock || /^\s*#{1,6}\s/.test(line)) flush()
    if (!cur) cur = { text: '', lineOf: [] }
    else {
      cur.text += '\n'
      cur.lineOf.push(lineNo)
    }
    cur.text += line
    for (let i = 0; i < line.length; i++) cur.lineOf.push(lineNo)
    if (/^\s*(?:#{1,6}\s|\|)/.test(line)) flush()
  })
  flush()
  return out
}

const CODE_SPAN = /(`+)([\s\S]*?[^`])\1(?!`)/g

/** A line with its code spans blanked out, the same length as the line. */
function maskCode(line) {
  return line.replace(CODE_SPAN, (m) => ' '.repeat(m.length))
}

/** A line without its complete HTML comments, those in code spans kept. */
function withoutComments(line) {
  const masked = maskCode(line)
  let out = line
  const found = [...masked.matchAll(/<!--.*?-->/g)].reverse()
  for (const m of found) {
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length)
  }
  return out
}

/** Code spans of a block: [{ start, end, inner }] where end is exclusive. */
function codeSpans(text) {
  const spans = []
  const re = /(`+)([\s\S]*?[^`])\1(?!`)/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    spans.push({ start: m.index, end: m.index + m[0].length, inner: m[2] })
  }
  return spans
}

/** The gap between a citation and a symbol: punctuation and at most one word. */
function isAdjacentGap(gap) {
  if (gap.length > 24 || /[.;!?]/.test(gap)) return false
  const words = gap
    .replace(/[(),:—–-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words.length <= 1 && words.every((w) => /^[A-Za-z]{1,12}$/.test(w))
}
const isGroupGap = (gap) => /^[\s,]*(?:and\s+)?$/.test(gap)

/** The citations of one block in order, before any symbol is attached. */
function findCitations(text, spans) {
  const found = []
  for (const m of text.matchAll(CITATION)) {
    if (THIRD_PARTY.test(m[1])) continue
    const pin = text.slice(0, m.index).match(PIN_BEFORE)?.[1] ?? null
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      path: m[1],
      lines: m[2],
      pin,
    })
  }
  for (const m of text.matchAll(CONTINUATION)) {
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      path: null,
      lines: m[1],
      pin: null,
    })
  }
  found.sort((a, b) => a.start - b.start)
  inheritPaths(text, spans, found)
  for (const c of found) widenToSpan(text, spans, c)
  return found
}

/**
 * A continuation takes the file named last before it: by a citation, or by a
 * span that is only a path, as in `MainWorkspace.tsx` ... (`:390-427`).
 */
function inheritPaths(text, spans, found) {
  const named = spans
    .filter(
      (s) =>
        PATH_ONLY.test(s.inner.trim()) && !THIRD_PARTY.test(s.inner.trim()),
    )
    .map((s) => ({
      start: s.start,
      path: s.inner.trim(),
      pin: text.slice(0, s.start).match(PIN_BEFORE)?.[1] ?? null,
    }))
  let last = { path: null, pin: null }
  let n = 0
  for (const c of found) {
    for (; n < named.length && named[n].start < c.start; n++) last = named[n]
    if (c.path) last = c
    else Object.assign(c, { path: last.path, pin: last.pin })
  }
}

/** Widens a citation to the code span that is exactly it, if there is one. */
function widenToSpan(text, spans, c) {
  const cited = text.slice(c.start, c.end)
  const own = spans.find((s) => s.start <= c.start && s.end >= c.end)
  c.outerStart = c.start
  c.outerEnd = c.end
  if (!own) return
  if (
    own.inner.trim().replace(/^:/, '') ===
    cited.replace(/^`?:?/, '').replace(/`$/, '')
  ) {
    c.outerStart = own.start
    c.outerEnd = own.end
  } else {
    // A citation inside a longer span: the rest of the span is its symbol.
    c.innerSymbol = own.inner.replace(cited, ' ')
  }
}

/** The symbol lookups for one block: the span after a citation, and before. */
function symbolFinder(text, spans, found) {
  const isCitationSpan = (s) =>
    found.some((c) => c.outerStart === s.start && c.outerEnd === s.end)
  // A span naming a file, a path or a revision is a reference, not a symbol.
  const isSymbolSpan = (s) =>
    !isCitationSpan(s) &&
    !PATHLIKE.test(s.inner.trim()) &&
    !REVISION.test(s.inner.trim())
  const spanAfter = (pos) => {
    const next = spans.find((s) => s.start >= pos)
    return next &&
      isSymbolSpan(next) &&
      isAdjacentGap(text.slice(pos, next.start))
      ? next
      : null
  }
  // A span directly after a citation is that citation's; the next citation
  // cannot borrow it as the span before it.
  const claimed = new Set(
    found
      .map((c) => spanAfter(c.outerEnd)?.start)
      .filter((x) => x !== undefined),
  )
  return {
    after(pos) {
      const quote = text.slice(pos).match(/^([^"“`]*)["“]([^"”]{3,}?)["”]/)
      return {
        symbol: spanAfter(pos)?.inner ?? null,
        title:
          quote && isAdjacentGap(quote[1])
            ? quote[2].replace(/\s+/g, ' ').trim()
            : null,
      }
    },
    before(pos) {
      const prev = [...spans].reverse().find((s) => s.end <= pos)
      const ok =
        prev &&
        isSymbolSpan(prev) &&
        !claimed.has(prev.start) &&
        isAdjacentGap(text.slice(prev.end, pos))
      return ok ? prev.inner : null
    },
  }
}

/** Groups: runs of citations separated only by commas, spaces or "and". */
function groupCitations(text, found) {
  const groups = []
  for (const c of found) {
    const g = groups.at(-1)
    if (g && isGroupGap(text.slice(g.at(-1).outerEnd, c.outerStart))) g.push(c)
    else groups.push([c])
  }
  return groups
}

/**
 * Every citation in one block, with the symbols beside it.
 * Returns [{ raw, path, lines, pin, offset, symbols: string[][], titles: string[] }]
 */
export function citationsInBlock(text) {
  const spans = codeSpans(text)
  const found = findCitations(text, spans)
  const symbols = symbolFinder(text, spans, found)
  const result = []
  for (const g of groupCitations(text, found)) {
    const before = symbols.before(g[0].outerStart)
    const after = symbols.after(g.at(-1).outerEnd)
    const shared = [before, after.symbol].filter(Boolean)
    // A title names one test, so a group does not share it.
    const titles = after.title && g.length === 1 ? [after.title] : []
    for (const c of g) {
      const own = c.innerSymbol ? [...shared, c.innerSymbol] : shared
      result.push({
        raw: c.raw,
        path: c.path,
        lines: c.lines,
        pin: c.pin,
        offset: c.start,
        symbols: own.map(symbolWords).filter((w) => w.length > 0),
        titles,
      })
    }
  }
  // A `:<lines>` with no file before it is not a citation: `:8787` is a port.
  return result.filter((c) => c.path !== null)
}

/** Parses a document into citations with their line number and mode. */
export function parseDocument(markdown) {
  const all = blocks(markdown)
  const head = maskCode(markdown.split('\n').slice(0, 10).join('\n'))
  const historical = head.match(
    /<!--\s*cite-check:\s*historical\b\s*(.*?)\s*-->/,
  )
  if (historical)
    return {
      historical: historical[1] || 'marked historical',
      citations: [],
      problems: [],
    }
  const citations = []
  const problems = []
  let mode = { kind: 'live' }
  for (const b of all) {
    if (b.marker) {
      if (b.marker === 'live') mode = { kind: 'live' }
      else if (b.marker === 'pinned') {
        if (!/^[\w./^~-]+$/.test(b.arg))
          problems.push({
            line: b.line,
            message: 'cite-check: pinned needs a revision',
          })
        mode = { kind: 'pinned', rev: b.arg }
      } else if (b.marker === 'skip') {
        if (!b.arg)
          problems.push({
            line: b.line,
            message: 'cite-check: skip needs a reason',
          })
        mode = { kind: 'skip' }
      } else if (b.marker === 'historical') {
        problems.push({
          line: b.line,
          message: 'cite-check: historical must be in the first 10 lines',
        })
      }
      continue
    }
    if (mode.kind === 'skip') continue
    for (const c of citationsInBlock(b.text)) {
      citations.push({
        ...c,
        line: b.lineOf[c.offset],
        rev: c.pin ?? (mode.kind === 'pinned' ? mode.rev : null),
      })
    }
  }
  return { historical: null, citations, problems }
}

// ------------------------------------------------------------
// Checking against a tree
// ------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (w) => new RegExp(`(?<![\\w$-])${escapeRe(w)}(?![\\w$-])`)

/** Does one of `words` appear within `window` lines of [a, b]? */
export function symbolNear(fileLines, [a, b], words, window = WINDOW) {
  const res = words.map(wordRe)
  const lo = Math.max(1, a - window)
  const hi = Math.min(fileLines.length, b + window)
  for (let i = lo; i <= hi; i++) {
    if (res.some((re) => re.test(fileLines[i - 1]))) return true
  }
  return false
}

export function titleNear(fileLines, [a, b], title, window = WINDOW) {
  const lo = Math.max(1, a - window)
  const hi = Math.min(fileLines.length, b + window)
  const text = fileLines
    .slice(lo - 1, hi)
    .join(' ')
    .replace(/\s+/g, ' ')
  const want = title.replace(/(?:\.\.\.|…)$/, '').trim()
  if (text.includes(want)) return true
  // An `it.each` title is a template: 'plays on through a live %s' is cited
  // as "plays on through a live glide.setQuality".
  for (const m of text.matchAll(
    /(['"`])((?:(?!\1).)*%[sdifjop#](?:(?!\1).)*)\1/g,
  )) {
    const pattern = m[2]
      .split(/%[sdifjop#]/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.+?')
    if (new RegExp(`^${pattern}$`).test(want)) return true
  }
  return false
}

/**
 * A tree is { files: string[], read(path) -> string[] | null }.
 * Returns an error message, or null when the citation holds.
 */
export function checkCitation(c, tree, { pinned }) {
  const matches = tree.files.includes(c.path)
    ? [c.path]
    : tree.files.filter((f) => f.endsWith(`/${c.path}`))
  const where = pinned ? ` at ${c.rev}` : ''
  if (matches.length === 0)
    return `${c.path}:${c.lines}: no tracked file matches ${c.path}${where}`
  if (matches.length > 1) {
    return `${c.path}:${c.lines}: ${matches.length} files match ${c.path}${where} (${matches.slice(0, 3).join(', ')}${matches.length > 3 ? ', ...' : ''}); write more of the path`
  }
  const file = matches[0]
  const fileLines = tree.read(file)
  const ranges = parseLines(c.lines)
  for (const [a, b] of ranges) {
    if (a < 1 || b < a || b > fileLines.length) {
      return `${c.path}:${c.lines}: line ${b > fileLines.length ? b : a} is outside ${file}${where} (${fileLines.length} lines)`
    }
  }
  const hasSymbol = c.symbols.length > 0 || c.titles.length > 0
  if (!hasSymbol) {
    if (pinned) return null
    return `${c.path}:${c.lines}: names no symbol; put the cited identifier in a code span beside it, or pin it to a revision`
  }
  for (const r of ranges) {
    const ok =
      c.symbols.some((words) => symbolNear(fileLines, r, words)) ||
      c.titles.some((t) => titleNear(fileLines, r, t))
    if (!ok) {
      const named = [
        ...c.symbols.map((w) => w.join('/')),
        ...c.titles.map((t) => `"${t}"`),
      ].join(' or ')
      return `${c.path}:${c.lines}: ${named} is not within ${WINDOW} lines of ${file}:${r[0] === r[1] ? r[0] : `${r[0]}-${r[1]}`}${where}`
    }
  }
  return null
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

function gitLines(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .split('\n')
    .filter(Boolean)
}

function workingTree(root) {
  const files = gitLines(root, ['ls-files'])
  const cache = new Map()
  return {
    files,
    read(path) {
      if (!cache.has(path)) {
        const full = join(root, path)
        cache.set(
          path,
          existsSync(full) ? readFileSync(full, 'utf8').split('\n') : [],
        )
      }
      return cache.get(path)
    },
  }
}

/** Trees at pinned revisions, their blobs read in one `git cat-file --batch`. */
function revisionTrees(root, revs, wanted) {
  const trees = new Map()
  for (const rev of revs) {
    const ok = spawnSync('git', [
      '-C',
      root,
      'rev-parse',
      '--verify',
      '--quiet',
      `${rev}^{commit}`,
    ])
    if (ok.status !== 0) {
      trees.set(rev, null)
      continue
    }
    trees.set(rev, {
      commit: ok.stdout.toString().trim().slice(0, 8),
      files: gitLines(root, ['ls-tree', '-r', '--name-only', rev]),
      blobs: new Map(),
    })
  }
  const requests = []
  for (const [rev, paths] of wanted) {
    const t = trees.get(rev)
    if (!t) continue
    for (const p of paths) {
      const matches = t.files.includes(p)
        ? [p]
        : t.files.filter((f) => f.endsWith(`/${p}`))
      if (matches.length === 1) requests.push([rev, matches[0]])
    }
  }
  if (requests.length > 0) {
    const input = `${requests.map(([rev, p]) => `${rev}:${p}`).join('\n')}\n`
    const out = spawnSync('git', ['-C', root, 'cat-file', '--batch'], {
      input,
      maxBuffer: 1 << 28,
    }).stdout
    let pos = 0
    for (const [rev, p] of requests) {
      const nl = out.indexOf(10, pos)
      const header = out.subarray(pos, nl).toString()
      const size = Number(header.split(' ')[2])
      const body = out.subarray(nl + 1, nl + 1 + size).toString('utf8')
      pos = nl + 1 + size + 1
      trees.get(rev).blobs.set(p, body.split('\n'))
    }
  }
  const result = new Map()
  for (const [rev, t] of trees) {
    result.set(
      rev,
      t && {
        commit: t.commit,
        files: t.files,
        read: (p) => t.blobs.get(p) ?? [],
      },
    )
  }
  return result
}

const TAG = /^v\d/

/** The verdict on a pinned citation, given the tree at its revision. */
function pinnedMessage(c, t) {
  const at = `${c.path}:${c.lines}`
  // Tags are not on every clone: the fork's remote has none, so a tag pin
  // that holds here fails in CI. Only a commit hash pins the same everywhere.
  if (TAG.test(c.rev))
    return t
      ? `${at}: pinned to the tag ${c.rev}; pin to the commit it names, ${t.commit}, since a clone may not have the tag`
      : `${at}: pinned to the tag ${c.rev}, which this clone does not have; pin to a commit hash`
  if (!t)
    return `${at}: pinned revision ${c.rev} is not in this clone (fetch full history)`
  return checkCitation(c, t, { pinned: true })
}

export function run(root, docs) {
  const tree = workingTree(root)
  const targets =
    docs.length > 0 ? docs : tree.files.filter((f) => f.endsWith('.md'))
  const report = {
    documents: [],
    errors: [],
    checked: 0,
    pinned: 0,
    historical: [],
  }
  const parsed = []
  for (const doc of targets) {
    if (isHistoricalPath(doc)) {
      report.historical.push({
        doc,
        why: 'dated, archived or changelog file name',
      })
      continue
    }
    const text = readFileSync(join(root, doc), 'utf8')
    const p = parseDocument(text)
    if (p.historical) {
      report.historical.push({ doc, why: p.historical })
      continue
    }
    for (const pr of p.problems)
      report.errors.push({ doc, line: pr.line, message: pr.message })
    parsed.push({ doc, citations: p.citations })
  }
  const wanted = new Map()
  for (const { citations } of parsed) {
    for (const c of citations) {
      if (!c.rev) continue
      if (!wanted.has(c.rev)) wanted.set(c.rev, new Set())
      wanted.get(c.rev).add(c.path)
    }
  }
  const trees = revisionTrees(root, [...wanted.keys()], wanted)
  for (const { doc, citations } of parsed) {
    const stats = { doc, citations: citations.length, pinned: 0, errors: 0 }
    for (const c of citations) {
      let message
      if (c.rev) {
        stats.pinned++
        message = pinnedMessage(c, trees.get(c.rev))
      } else {
        message = checkCitation(c, tree, { pinned: false })
      }
      if (message) {
        stats.errors++
        report.errors.push({ doc, line: c.line, message })
      }
    }
    report.checked += citations.length
    report.pinned += stats.pinned
    report.documents.push(stats)
  }
  return report
}

function main() {
  const argv = process.argv.slice(2)
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const docs = argv.filter((a) => !a.startsWith('--'))
  const root = process.cwd()
  const started = performance.now()
  let report
  try {
    report = run(root, docs)
  } catch (error) {
    console.error(
      `check-doc-citations: cannot run: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 2
    return
  }
  const ms = Math.round(performance.now() - started)
  if (flags.has('--json')) {
    process.stdout.write(`${JSON.stringify({ ...report, ms }, null, 2)}\n`)
  } else {
    for (const e of report.errors)
      console.log(`${e.doc}:${e.line}: ${e.message}`)
    if (flags.has('--stats')) {
      for (const d of report.documents.filter((x) => x.citations > 0)) {
        console.log(
          `  ${d.doc}: ${d.citations} citations, ${d.pinned} pinned, ${d.errors} failing`,
        )
      }
    }
    const live = report.checked - report.pinned
    console.log(
      `${report.errors.length === 0 ? 'Citations OK' : `${report.errors.length} stale or unverifiable citations`}: ` +
        `${report.checked} checked (${live} against the tree, ${report.pinned} pinned) in ` +
        `${report.documents.length} documents, ${report.historical.length} historical documents skipped, ${ms} ms`,
    )
  }
  // exitCode, not exit(): exit() drops whatever stdout has not flushed yet,
  // which on a pipe read slower than it is written (a CI runner) was most of
  // the failure list and the summary line.
  process.exitCode = report.errors.length === 0 ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main()
