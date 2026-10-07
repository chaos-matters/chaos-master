// Tests for the doc citation checker (scripts/check-doc-citations.mjs): how a
// citation, its symbol and its mode are read from markdown, how one is judged
// against a tree, and the CLI's exit codes on a scratch git repository.
//
//   node --test scripts/check-doc-citations.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { blocks, checkCitation, citationsInBlock, isHistoricalPath, parseDocument, parseLines, titleNear, } from './check-doc-citations.mjs'

const SCRIPT = fileURLToPath(
  new URL('./check-doc-citations.mjs', import.meta.url),
)

/** The citations of one paragraph, reduced to what a test asserts on. */
const cites = (text) =>
  citationsInBlock(text).map((c) => ({
    path: c.path,
    lines: c.lines,
    symbols: c.symbols,
    titles: c.titles,
  }))

/** A tree of in-memory files, the shape checkCitation takes. */
const treeOf = (files) => ({
  files: Object.keys(files),
  read: (p) => files[p].split('\n'),
})

const SOURCE = [
  '// A scratch module.', //  1
  'export function alpha() {', //  2
  '  return 1', //  3
  '}', //  4
  '', //  5
  '', //  6
  '', //  7
  '', //  8
  '', //  9
  '', // 10
  '', // 11
  '', // 12
  'export const beta = 2', // 13
].join('\n')

await describe('parseLines', async () => {
  await it('reads a line, a range and a comma list', () => {
    assert.deepEqual(parseLines('12'), [[12, 12]])
    assert.deepEqual(parseLines('12-20'), [[12, 20]])
    assert.deepEqual(parseLines('3,40-44'), [
      [3, 3],
      [40, 44],
    ])
  })
})

await describe('isHistoricalPath', async () => {
  await it('treats changelogs, archives and dated file names as historical', () => {
    assert.equal(isHistoricalPath('packages/app/dev.changelog.md'), true)
    assert.equal(isHistoricalPath('docs/plans/archive/plan.md'), true)
    assert.equal(isHistoricalPath('docs/x/2026-09-10-audit.md'), true)
    assert.equal(isHistoricalPath('docs/x/audit-2026-07.md'), true)
  })

  await it('keeps a living document live', () => {
    assert.equal(isHistoricalPath('docs/agent/CODE-HEALTH.md'), false)
    assert.equal(isHistoricalPath('docs/specs/arcade-beats.ears.md'), false)
  })
})

await describe('the symbol beside a citation', async () => {
  await it('is the code span right after it', () => {
    assert.deepEqual(cites('See `a.ts:3` (`alpha`) for it.'), [
      { path: 'a.ts', lines: '3', symbols: [['alpha']], titles: [] },
    ])
  })

  await it('is the code span right before it when none follows', () => {
    assert.deepEqual(cites('The `alpha` function, `a.ts:3`.')[0].symbols, [
      ['alpha'],
    ])
  })

  await it('allows one short word between them, and not two', () => {
    assert.deepEqual(cites('`a.ts:3` in `alpha`')[0].symbols, [['alpha']])
    assert.deepEqual(cites('`a.ts:3` is in `alpha`')[0].symbols, [])
  })

  await it('never takes a path or a revision for a symbol', () => {
    assert.deepEqual(cites('`a.ts:3` (`src/b.ts`)')[0].symbols, [])
    assert.deepEqual(cites('`a.ts:3` (`a5c2f26f`)')[0].symbols, [])
    assert.deepEqual(cites('`a.ts:3` (`v0.9.11`)')[0].symbols, [])
  })

  await it('drops generic words and keeps identifiers', () => {
    assert.deepEqual(
      cites('`a.ts:3` (`const value = ui.tabletLayout`)')[0].symbols,
      [['tabletLayout']],
    )
  })

  await it('is shared across a group joined by commas and "and"', () => {
    const got = cites('`a.ts:3`, `b.ts:9` and `c.ts:1` (`alpha`)')
    assert.deepEqual(
      got.map((c) => [c.path, c.symbols]),
      [
        ['a.ts', [['alpha']]],
        ['b.ts', [['alpha']]],
        ['c.ts', [['alpha']]],
      ],
    )
  })

  await it('takes a quoted test title, but never shares it across a group', () => {
    assert.deepEqual(cites('`a.test.ts:3` "keeps the tier"')[0].titles, [
      'keeps the tier',
    ])
    const group = cites('`a.test.ts:3`, `b.test.ts:4` "keeps the tier"')
    assert.deepEqual(
      group.map((c) => c.titles),
      [[], []],
    )
  })
})

await describe('a continuation', async () => {
  await it('inherits the file of the citation before it', () => {
    assert.deepEqual(
      cites('`a.ts:3` (`alpha`), `:13` (`beta`)').map((c) => [c.path, c.lines]),
      [
        ['a.ts', '3'],
        ['a.ts', '13'],
      ],
    )
  })

  await it('inherits a file named by a path-only code span', () => {
    assert.deepEqual(
      cites('In `src/a.ts` the export (`:13`, `beta`)').map((c) => [
        c.path,
        c.lines,
      ]),
      [['src/a.ts', '13']],
    )
  })

  await it('is not a citation with no file before it', () => {
    assert.deepEqual(cites('The dev server listens on `:8787`.'), [])
  })
})

await describe('what is not a citation', async () => {
  await it('skips a third-party path', () => {
    assert.deepEqual(cites('`node_modules/x/index.js:4` (`thing`)'), [])
  })

  await it('ignores fenced code and HTML comments', () => {
    const md = [
      '```ts',
      '// a.ts:3 (`alpha`)',
      '```',
      '<!-- `a.ts:3` (`alpha`) -->',
      'Live: `a.ts:13` (`beta`).',
    ].join('\n')
    assert.deepEqual(
      parseDocument(md).citations.map((c) => [c.lines, c.line]),
      [['13', 5]],
    )
  })
})

await describe('blocks', async () => {
  await it('reads a blockquote over several lines as one paragraph', () => {
    const got = blocks('> The `alpha` export,\n> `a.ts:3`, is it.')
    assert.equal(got.length, 1)
    assert.equal(got[0].text, 'The `alpha` export,\n`a.ts:3`, is it.')
    assert.deepEqual(citationsInBlock(got[0].text)[0].symbols, [['alpha']])
  })

  await it('splits list items and table rows', () => {
    assert.equal(blocks('- one\n- two').length, 2)
    assert.equal(blocks('| a |\n| b |').length, 2)
  })
})

await describe('parseDocument modes', async () => {
  await it('pins a region to a revision until the next live marker', () => {
    const md = [
      '<!-- cite-check: pinned a5c2f26f -->',
      '`a.ts:3` as it was.',
      '<!-- cite-check: live -->',
      '`a.ts:13` (`beta`)',
    ].join('\n')
    assert.deepEqual(
      parseDocument(md).citations.map((c) => [c.lines, c.rev]),
      [
        ['3', 'a5c2f26f'],
        ['13', null],
      ],
    )
  })

  await it('pins one citation with a revision right before its path', () => {
    const md = 'At the tag, v0.9.11 `a.ts:3` read differently.'
    assert.equal(parseDocument(md).citations[0].rev, 'v0.9.11')
  })

  await it('skips a region only with a reason', () => {
    const md = '<!-- cite-check: skip -->\n`a.ts:3`'
    const p = parseDocument(md)
    assert.deepEqual(p.citations, [])
    assert.deepEqual(
      p.problems.map((x) => x.message),
      ['cite-check: skip needs a reason'],
    )
  })

  await it('reads a marker in a code span as text, not as a marker', () => {
    const md = [
      'Pin a region with `<!-- cite-check: pinned <rev> -->`.',
      '`a.ts:13` (`beta`)',
    ].join('\n')
    const p = parseDocument(md)
    assert.deepEqual(p.problems, [])
    assert.deepEqual(
      p.citations.map((c) => [c.lines, c.rev]),
      [['13', null]],
    )
  })

  await it('keeps an HTML comment in a code span as text', () => {
    const md = 'Write `<!--` to open one; `a.ts:13` (`beta`) still counts.'
    assert.deepEqual(
      parseDocument(md).citations.map((c) => c.lines),
      ['13'],
    )
  })

  await it('treats a document marked historical in its first 10 lines as history', () => {
    const md =
      '# Old plan\n<!-- cite-check: historical superseded by the master plan -->\n`a.ts:3`'
    const p = parseDocument(md)
    assert.equal(p.historical, 'superseded by the master plan')
    assert.deepEqual(p.citations, [])
  })

  await it('refuses a historical marker further down', () => {
    const md = `${'\n'.repeat(12)}<!-- cite-check: historical too late -->`
    assert.deepEqual(
      parseDocument(md).problems.map((x) => x.message),
      ['cite-check: historical must be in the first 10 lines'],
    )
  })
})

await describe('checkCitation', async () => {
  const tree = treeOf({
    'src/a.ts': SOURCE,
    'lib/a.ts': SOURCE,
    'src/b.ts': SOURCE,
  })
  const citation = (path, lines, symbols = [], titles = []) => ({
    path,
    lines,
    symbols,
    titles,
  })

  await it('holds when the symbol is on the cited line or within the window', () => {
    assert.equal(
      checkCitation(citation('src/a.ts', '2', [['alpha']]), tree, {
        pinned: false,
      }),
      null,
    )
    // beta is on line 13: 8 is exactly WINDOW (5) lines away.
    assert.equal(
      checkCitation(citation('src/a.ts', '8', [['beta']]), tree, {
        pinned: false,
      }),
      null,
    )
  })

  await it('fails when the symbol moved out of the window', () => {
    const msg = checkCitation(citation('src/a.ts', '7', [['beta']]), tree, {
      pinned: false,
    })
    assert.match(msg, /beta is not within 5 lines of src\/a\.ts:7/)
  })

  await it('fails for a missing file, an ambiguous suffix and a line past the end', () => {
    assert.match(
      checkCitation(citation('c.ts', '1', [['x']]), tree, { pinned: false }),
      /no tracked file matches/,
    )
    assert.match(
      checkCitation(citation('a.ts', '1', [['alpha']]), tree, {
        pinned: false,
      }),
      /2 files match a\.ts/,
    )
    assert.match(
      checkCitation(citation('src/b.ts', '14', [['beta']]), tree, {
        pinned: false,
      }),
      /line 14 is outside/,
    )
  })

  await it('requires a symbol in a living document, and not in a pinned one', () => {
    assert.match(
      checkCitation(citation('src/b.ts', '2'), tree, { pinned: false }),
      /names no symbol/,
    )
    assert.equal(
      checkCitation(citation('src/b.ts', '2'), tree, { pinned: true }),
      null,
    )
  })

  await it('checks every range of a comma list', () => {
    assert.equal(
      checkCitation(citation('src/b.ts', '2,13', [['alpha', 'beta']]), tree, {
        pinned: false,
      }),
      null,
    )
    assert.match(
      checkCitation(citation('src/b.ts', '2,13', [['alpha']]), tree, {
        pinned: false,
      }),
      /alpha is not within 5 lines of src\/b\.ts:13/,
    )
  })
})

await describe('titleNear', async () => {
  const file = [
    "it('keeps the tier', () => {",
    "it.each(['a', 'b'])('plays on through a live %s', (x) => {",
  ]

  await it('finds a literal title', () => {
    assert.equal(titleNear(file, [1, 1], 'keeps the tier'), true)
  })

  await it('matches an it.each template', () => {
    assert.equal(
      titleNear(file, [2, 2], 'plays on through a live glide.setQuality'),
      true,
    )
    assert.equal(titleNear(file, [2, 2], 'stops on a live glide'), false)
  })
})

await describe('the CLI on a git repository', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cite-check-'))
  after(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  // Isolated from the machine's git config: no signing, no hooks, no hints.
  const ISOLATED = [
    ['user.name', 'cite-check'],
    ['user.email', 'cite-check@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.hooksPath', '/dev/null'],
    ['init.defaultBranch', 'main'],
  ].flatMap(([k, v]) => ['-c', `${k}=${v}`])
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...ISOLATED, ...args], { encoding: 'utf8' })
  const check = (...args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: dir,
      encoding: 'utf8',
    })

  git('init', '--quiet')
  writeFileSync(join(dir, 'a.ts'), SOURCE)
  writeFileSync(
    join(dir, 'doc.md'),
    '# Doc\n\n`a.ts:13` (`beta`) holds the answer.\n',
  )
  git('add', '.')
  git('commit', '--quiet', '-m', 'first')
  const first = git('rev-parse', '--short=8', 'HEAD').trim()

  await it('exits 0 when every citation holds', () => {
    const r = check()
    assert.equal(r.status, 0, r.stdout)
    assert.match(
      r.stdout,
      /^Citations OK: 1 checked \(1 against the tree, 0 pinned\) in 1 documents/m,
    )
  })

  await it('exits 1 and names the line when the code moves', () => {
    writeFileSync(
      join(dir, 'a.ts'),
      SOURCE.replace('export const beta = 2', '\n'.repeat(10)).concat(
        '\nexport const beta = 2',
      ),
    )
    git('commit', '--quiet', '-am', 'move beta')
    const r = check()
    assert.equal(r.status, 1)
    assert.match(
      r.stdout,
      /^doc\.md:3: a\.ts:13: beta is not within 5 lines of a\.ts:13$/m,
    )
  })

  await it('checks a pinned citation against its revision, where it cannot drift', () => {
    writeFileSync(
      join(dir, 'doc.md'),
      `# Doc\n\n${first} \`a.ts:13\` (\`beta\`) held the answer.\n`,
    )
    const r = check('doc.md')
    assert.equal(r.status, 0, r.stdout)
    assert.match(r.stdout, /1 pinned/)
  })

  // The fork's remote has no tags, so CI's clone has none: a tag pin that
  // passed here failed there (four in BUGS.md on this PR's first green run).
  await it('refuses a pin to a tag and names the commit to pin to instead', () => {
    git('tag', 'v1.0.0', first)
    writeFileSync(
      join(dir, 'doc.md'),
      '# Doc\n\nAt v1.0.0 `a.ts:13` (`beta`) held the answer.\n',
    )
    const r = check('doc.md')
    assert.equal(r.status, 1, r.stdout)
    assert.match(
      r.stdout,
      new RegExp(
        `^doc\\.md:3: a\\.ts:13: pinned to the tag v1\\.0\\.0; pin to the commit it names, ${first}`,
        'm',
      ),
    )
  })

  // A CI runner reads the job's output more slowly than the script writes it.
  // Once the pipe is full, the writes queue, and process.exit() used to drop
  // the queue: the red run on the PR that added this script logged 443 of its
  // 1,360 failures and no summary line.
  await it('prints every failure and the summary to a pipe that is read late', async () => {
    const n = 2000
    writeFileSync(
      join(dir, 'long.md'),
      `# Long\n\n${'`a.ts:999` (`beta`) is past the end.\n\n'.repeat(n)}`,
    )
    const child = spawn(process.execPath, [SCRIPT, 'long.md'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const closed = new Promise((resolve) => child.on('close', resolve))
    let out = ''
    let stalled = false
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      out += chunk
      // Stop reading after the first chunk, as a busy runner does, so the
      // script's later writes have to wait in its queue.
      if (!stalled) {
        stalled = true
        child.stdout.pause()
        void delay(500).then(() => child.stdout.resume())
      }
    })
    const status = await closed
    assert.equal(status, 1)
    assert.equal(out.match(/^long\.md:\d+: /gm)?.length, n)
    assert.match(
      out,
      new RegExp(`^${n} stale or unverifiable citations: `, 'm'),
    )
  })

  await it('exits 2 when a named document cannot be read', () => {
    const r = check('missing.md')
    assert.equal(r.status, 2)
    assert.match(r.stderr, /cannot run/)
  })
})

// During an unresolved merge `git ls-files` lists a conflicted path once per
// stage (base, ours, theirs). The checker read that list as the tree, so a
// conflicted document was checked and counted three times, and a conflicted
// source file cited by a suffix matched itself three times.
await describe('the CLI during an unresolved merge', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cite-check-merge-'))
  after(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  const ISOLATED = [
    ['user.name', 'cite-check'],
    ['user.email', 'cite-check@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.hooksPath', '/dev/null'],
    ['init.defaultBranch', 'main'],
    ['merge.conflictStyle', 'merge'],
  ].flatMap(([k, v]) => ['-c', `${k}=${v}`])
  const git = (...args) =>
    spawnSync('git', ['-C', dir, ...ISOLATED, ...args], { encoding: 'utf8' })
  const check = (...args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: dir,
      encoding: 'utf8',
    })
  const doc = (word) =>
    `# Doc\n\n\`b.ts:13\` (\`beta\`) holds the ${word} answer.\n`

  mkdirSync(join(dir, 'lib'))
  git('init', '--quiet')
  writeFileSync(join(dir, 'lib/b.ts'), SOURCE)
  writeFileSync(join(dir, 'doc.md'), doc('first'))
  git('add', '.')
  git('commit', '--quiet', '-m', 'base')
  git('checkout', '--quiet', '-b', 'side')
  writeFileSync(join(dir, 'doc.md'), doc('side'))
  writeFileSync(join(dir, 'lib/b.ts'), `${SOURCE}// side\n`)
  git('commit', '--quiet', '-am', 'side')
  git('checkout', '--quiet', 'main')
  writeFileSync(join(dir, 'doc.md'), doc('main'))
  writeFileSync(join(dir, 'lib/b.ts'), `${SOURCE}// main\n`)
  git('commit', '--quiet', '-am', 'main')
  const merge = git('merge', '--quiet', 'side')

  await it('has both files in conflict, listed once per stage', () => {
    assert.notEqual(merge.status, 0)
    const listed = git('ls-files').stdout.split('\n').filter(Boolean)
    assert.equal(listed.filter((f) => f === 'doc.md').length, 3)
    assert.equal(listed.filter((f) => f === 'lib/b.ts').length, 3)
  })

  await it('checks a conflicted document once, and matches a conflicted file once', () => {
    const r = check('--json')
    const report = JSON.parse(r.stdout)
    assert.deepEqual(
      report.documents.map((d) => d.doc),
      ['doc.md'],
    )
    // The conflict leaves both sides' copy of the one citation in the file,
    // and each resolves to the one lib/b.ts, not to three.
    assert.equal(report.checked, 2)
    assert.deepEqual(
      report.errors.map((e) => e.message),
      [],
    )
  })
})
