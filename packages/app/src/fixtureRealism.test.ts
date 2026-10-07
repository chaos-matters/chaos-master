// Guards the flame fixtures, and the tables of variation names, against
// shapes no real flame has.
//
// A real flame keys its variations by generated ids (UUIDs with underscores,
// `generateVariationId`) and types them with registered names: `validateFlame`
// rewrites the legacy names on every load (`linear` becomes `linearVar`),
// refuses every name an object inherits (`toString`, `__proto__`, ...) and
// `prototype`, and keeps any other string as it was written. A fixture keyed
// by its own type names, or typed with a legacy or unknown name, lets a reader
// that looks at the wrong field pass. The Arena school, the Duel judge and the
// Art Director's taste all read the id instead of the type behind fixtures like
// `{ linearVar: { type: 'linearVar' } }` and `{ [name]: { type: name } }`,
// and #117's symmetry transforms carried the unregistered 'linear' past tests
// that used it too.
//
// The rules, over the app and core sources and the Playwright specs (tests/
// and packages/app/e2e/):
//   (a) a `{ type, weight }` object whose type is a string no registry knows:
//       "legacy" when the migration rewrites it, "unregistered" otherwise.
//       `custom_<uuid>` is the custom variations' own family.
//   (b) a variation keyed by its own type, or given an `id` equal to it:
//       `linearVar: { type: 'linearVar' }`, `[name]: { type: name }`,
//       `variations[name] = { type: name }`, `[name, { type: name }]`.
//   (c) a string spelled like a variation (`...Var`, `...Var3D`) that is not
//       registered.
//   (d) a table in production code whose keys or elements are variation
//       names (two or more registered ones) and that also holds names no
//       loaded flame can have.
// A type assembled in an expression (#117's `is3D ? 'linear3D' : 'linear'`)
// is out of reach of a syntax scan; the producer property test
// (flame/producedVariationTypes.test.ts) covers that.
//
// Each exception below carries its reason, and one that no longer matches
// anything fails as well.
//
// The registered names come from the list flame/variationRegistry.test.ts
// keeps in step with the registries, and the legacy ones from the migration
// table's own module: importing the registries and the whole core package
// took most of this file's time.
import { VARIATION_TYPE_MIGRATIONS } from '@chaos-master/core/schema/migrateFlameTypes'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '../../..')
const ROOTS = [
  'packages/app/src',
  'packages/core/src',
  'packages/app/e2e',
  'tests',
]
const REGISTERED_NAMES =
  'packages/app/src/flame/__fixtures__/registeredVariationNames.json'

type Rule = 'a' | 'b' | 'c' | 'd'
type Hit = { file: string; line: number; rule: Rule; detail: string }
type Exception = {
  file: string
  rule: Rule
  /** The hit's detail, or a pattern for a family of them. */
  detail: string | RegExp
  reason: string
}

const EXCEPTIONS: readonly Exception[] = [
  {
    file: 'packages/app/src/commands/builtins/flame.security.test.ts',
    rule: 'a',
    detail: 'constructor (unregistered)',
    reason:
      'hostile input: an inherited Object key must not pass the command registry lookups',
  },
  {
    file: 'packages/app/src/flame/transformFunction.security.test.ts',
    rule: 'a',
    detail: 'constructor (unregistered)',
    reason:
      'hostile input: an inherited Object key must not reach the 2D or 3D GPU uniforms',
  },
  {
    file: 'packages/app/src/flame/variations/paramEditorRegistry.test.ts',
    rule: 'c',
    detail: /^(unknownNonExistentVar|testFallbackVar|testLazyVar)$/,
    reason:
      'names that are not registered on purpose: the editor registry falls back, or loads lazily, for them',
  },
  {
    file: 'packages/app/src/recorder/synthesize/planCreation.test.ts',
    rule: 'a',
    detail: 'spherical (legacy: sphericalVar)',
    reason: 'tests that a legacy descriptor is migrated on the way in',
  },
  {
    file: 'packages/core/src/schema/migrateFlameTypes.test.ts',
    rule: 'a',
    detail: 'horseshoe (legacy: horseshoeVar)',
    reason: "the migration's own tests: a legacy name is their input",
  },
  {
    file: 'packages/core/src/schema/migrateFlameTypes.test.ts',
    rule: 'c',
    detail: /^(flipyVar|flipcircleVar)$/,
    reason:
      "the migration's own tests: the two misspelled names it corrects are their input",
  },
  {
    file: 'packages/app/src/flame/variations/parametric/general/whirligigVar.tsx',
    rule: 'c',
    detail: /^whirligigVar$/,
    reason:
      'finding, not decided here: a variation file the registry does not list (register it or delete it)',
  },
  {
    file: 'packages/app/src/utils/timeline.ts',
    rule: 'd',
    detail: /^VariationParameterMaps: /,
    reason:
      'finding, not decided here: a table no production code reads, keyed by names no flame holds (delete it or re-key it)',
  },
]

const names = JSON.parse(
  readFileSync(join(REPO, REGISTERED_NAMES), 'utf8'),
) as Record<'2D' | '3D', string[]>
const registered = new Set<string>([...names['2D'], ...names['3D']])
/** `custom_` and a UUID with underscores, as `generateCustomVariationId` mints it. */
const CUSTOM_TYPE =
  /^custom_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/
const VARIATION_SPELLING = /^[a-z][A-Za-z0-9]*Var(?:3D)?$/

const isRealType = (type: string) =>
  registered.has(type) || CUSTOM_TYPE.test(type)

const isTestFile = (file: string) =>
  /\.(test|spec)\.tsx?$/.test(file) ||
  /testUtils\.tsx?$/.test(file) ||
  /\/__fixtures__\//.test(file)

const WEIGHT_KEY = /\bweight\b['"]?\]?\s*[:,}]/
const TYPE_KEY = /\btype\b['"]?\]?\s*[:,}]/
/**
 * A name where a table can hold it: a key (`name:`, `'name':`, `['name']:`)
 * or a quoted string anywhere but after a colon, which is where an array's
 * elements are and a property's value (`type: 'linearVar'`) is not.
 */
const TABLE_SLOT =
  /\b([A-Za-z][A-Za-z0-9_]*(?:Var|3D))['"`]?\]?\s*:|(?<!:\s*)['"`]([A-Za-z][A-Za-z0-9_]*(?:Var|3D))['"`]/g

/**
 * Worth parsing: the text can hold a hit. Each test over-approximates its
 * rules, so a file it passes over has none, and parsing only the rest keeps
 * the scan to a few hundred milliseconds.
 */
function mayMatch(text: string, production: boolean): boolean {
  // (a), (b): a `weight` and a `type` property, plain, quoted, computed
  // or shorthand. Reading `v.weight` is not one.
  if (WEIGHT_KEY.test(text) && TYPE_KEY.test(text)) return true
  // (c): a quoted variation spelling that is not registered.
  for (const [, name] of text.matchAll(
    /['"`]([a-z][A-Za-z0-9]*Var(?:3D)?)['"`]/g,
  )) {
    if (!registered.has(name!)) return true
  }
  // (d): two registered names in production code, where a table holds
  // them. Every registered name ends in Var or 3D (pinned below), so this
  // pattern sees them all.
  if (!production) return false
  let slots = 0
  for (const [, key, element] of text.matchAll(TABLE_SLOT)) {
    if (registered.has((key ?? element)!) && ++slots >= 2) return true
  }
  return false
}

/** `as`, `satisfies`, `!`, `<T>` and parentheses: what leaves a value as it is. */
const isWrapper = (
  node: ts.Node,
): node is
  | ts.ParenthesizedExpression
  | ts.AsExpression
  | ts.SatisfiesExpression
  | ts.NonNullExpression
  | ts.TypeAssertion =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isTypeAssertionExpression(node)

function unwrap(expression: ts.Expression): ts.Expression {
  let e = expression
  while (isWrapper(e)) e = e.expression
  return e
}

// The scan parses without parent pointers, which saves a pass over every
// tree, and hands the helpers below the stack of a node's ancestors instead:
// `ancestors.at(-1)` is its parent.

/** The node an expression's wrappers sit in. */
function outerParent(ancestors: readonly ts.Node[]): ts.Node {
  let i = ancestors.length - 1
  while (i > 0 && isWrapper(ancestors[i]!)) i--
  return ancestors[i]!
}

function staticName(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text
  }
  if (ts.isComputedPropertyName(name)) {
    const e = unwrap(name.expression)
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      return e.text
    }
  }
  return undefined
}

const isStringLike = (
  e: ts.Node,
): e is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)

/** An expression that names a value, compared by its text: `name`, `v.type`. */
function reference(e: ts.Expression, source: ts.SourceFile) {
  const inner = unwrap(e)
  return ts.isIdentifier(inner) || ts.isPropertyAccessExpression(inner)
    ? inner.getText(source)
    : undefined
}

/** The name of the declaration or property a table literal is assigned to. */
function containerName(ancestors: readonly ts.Node[]): string {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const p = ancestors[i]!
    if (
      (ts.isVariableDeclaration(p) ||
        ts.isPropertyAssignment(p) ||
        ts.isPropertyDeclaration(p)) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
    ) {
      return p.name.text
    }
  }
  return '(unnamed)'
}

/**
 * The name a table member holds: an object's explicit key, or an array's
 * string element. Only explicit `key: value` pairs: `{ blob, juliaVar }`
 * lists modules by their variable names, it does not key by variation.
 */
function memberName(member: ts.Node): string | undefined {
  if (ts.isPropertyAssignment(member)) return staticName(member.name)
  return isStringLike(member) ? member.text : undefined
}

type Finding = [Rule, string]

/** The `type` and `id` of an object literal that also has a `weight`. */
function variationParts(node: ts.ObjectLiteralExpression) {
  let type: ts.Expression | undefined
  let id: ts.Expression | undefined
  let weight = false
  for (const p of node.properties) {
    let name: string | undefined
    let value: ts.Expression
    if (ts.isShorthandPropertyAssignment(p)) {
      name = p.name.text
      value = p.name
    } else if (ts.isPropertyAssignment(p)) {
      name = staticName(p.name)
      value = p.initializer
    } else {
      continue
    }
    if (name === 'type') type = value
    else if (name === 'id') id = value
    else if (name === 'weight') weight = true
  }
  return type && weight ? { type, id } : undefined
}

/** Rules (a) and (b) for a type written as a string. */
function literalTypeFindings(
  type: string,
  holder: ts.Node,
  id: ts.Expression | undefined,
): Finding[] {
  const findings: Finding[] = []
  if (!isRealType(type)) {
    findings.push([
      'a',
      Object.hasOwn(VARIATION_TYPE_MIGRATIONS, type)
        ? `${type} (legacy: ${VARIATION_TYPE_MIGRATIONS[type]})`
        : `${type} (unregistered)`,
    ])
  }
  if (ts.isPropertyAssignment(holder) && staticName(holder.name) === type) {
    findings.push(['b', `${type}: { type: '${type}' }`])
  }
  const idValue = id && unwrap(id)
  if (idValue && isStringLike(idValue) && idValue.text === type) {
    findings.push(['b', `id: '${type}'`])
  }
  return findings
}

/** Rule (b) for a type given by reference: a key or id naming the same value. */
function referenceTypeFindings(
  node: ts.ObjectLiteralExpression,
  typeRef: string,
  holder: ts.Node,
  id: ts.Expression | undefined,
  source: ts.SourceFile,
): Finding[] {
  const same = (e: ts.Expression | undefined) =>
    e !== undefined && reference(e, source) === typeRef
  const findings: Finding[] = []
  // [name]: { type: name }
  if (
    ts.isPropertyAssignment(holder) &&
    ts.isComputedPropertyName(holder.name) &&
    same(holder.name.expression)
  ) {
    findings.push(['b', `[${typeRef}]: { type: ${typeRef} }`])
  }
  // variations[name] = { type: name }
  if (
    ts.isBinaryExpression(holder) &&
    holder.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isElementAccessExpression(holder.left) &&
    same(holder.left.argumentExpression)
  ) {
    findings.push(['b', `[${typeRef}] = { type: ${typeRef} }`])
  }
  // Object.fromEntries: [name, { type: name }]
  if (ts.isArrayLiteralExpression(holder)) {
    const [first, second] = holder.elements
    if (second && unwrap(second) === node && same(first)) {
      findings.push(['b', `[${typeRef}, { type: ${typeRef} }]`])
    }
  }
  if (same(id)) findings.push(['b', `id: ${typeRef}`])
  return findings
}

function scanSource(file: string, text: string): Hit[] {
  const source = ts.createSourceFile(
    file,
    text,
    {
      languageVersion: ts.ScriptTarget.Latest,
      // No rule reads a comment.
      jsDocParsingMode: ts.JSDocParsingMode.ParseNone,
    },
    false,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const production = !isTestFile(file)
  const hits: Hit[] = []
  const hit = (node: ts.Node, rule: Rule, detail: string) =>
    hits.push({
      file,
      line:
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      rule,
      detail,
    })

  /** Rules (a) and (b) on one `{ type, weight }` object. */
  const variationObject = (node: ts.ObjectLiteralExpression) => {
    const parts = variationParts(node)
    if (!parts) return
    const holder = outerParent(ancestors)
    const literal = unwrap(parts.type)
    const typeRef = reference(parts.type, source)
    const findings = isStringLike(literal)
      ? literalTypeFindings(literal.text, holder, parts.id)
      : typeRef
        ? referenceTypeFindings(node, typeRef, holder, parts.id, source)
        : []
    for (const [rule, detail] of findings) hit(node, rule, detail)
  }

  /** Rule (d): a production table of variation names. */
  const table = (members: readonly ts.Node[]) => {
    let known = 0
    for (const m of members) {
      const name = memberName(m)
      if (name !== undefined && registered.has(name)) known++
    }
    if (known < 2) return
    const container = containerName(ancestors)
    for (const m of members) {
      const name = memberName(m)
      if (name !== undefined && !isRealType(name)) {
        hit(m, 'd', `${container}: ${name}`)
      }
    }
  }

  const ancestors: ts.Node[] = []
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      variationObject(node)
      if (production) table(node.properties)
    } else if (ts.isArrayLiteralExpression(node)) {
      if (production) table(node.elements)
    } else if (
      isStringLike(node) &&
      VARIATION_SPELLING.test(node.text) &&
      !registered.has(node.text)
    ) {
      hit(node, 'c', node.text)
    }
    ancestors.push(node)
    ts.forEachChild(node, visit)
    ancestors.pop()
  }
  visit(source)
  return hits
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a directory under ROOTS, in this repo
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const { name } = entry
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (entry.isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) acc.push(full)
  }
  return acc
}

const posix = (p: string) => p.split('\\').join('/')
const show = (h: Hit) => `${h.file}:${h.line} (${h.rule}) ${h.detail}`
const excuses = (e: Exception, h: Hit) =>
  e.file === h.file &&
  e.rule === h.rule &&
  (typeof e.detail === 'string'
    ? e.detail === h.detail
    : e.detail.test(h.detail))

let tree: { files: number; hits: Hit[] } | undefined

/** The whole scan, once: the first test that asks pays for it. */
function scanTree() {
  if (tree) return tree
  const files = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)))
  const hits = files.flatMap((full) => {
    const file = posix(relative(REPO, full))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file sourceFiles listed
    const text = readFileSync(full, 'utf8')
    return mayMatch(text, !isTestFile(file)) ? scanSource(file, text) : []
  })
  tree = { files: files.length, hits }
  return tree
}

describe('flame fixtures and variation tables', () => {
  it('look like real flames', () => {
    const { files, hits } = scanTree()
    expect(files).toBeGreaterThan(1000)
    expect(
      hits.filter((h) => !EXCEPTIONS.some((e) => excuses(e, h))).map(show),
    ).toEqual([])
  })

  it('keep only exceptions that still match, each with its reason', () => {
    const { hits } = scanTree()
    expect(
      EXCEPTIONS.filter(
        (e) => e.reason.length < 20 || !hits.some((h) => excuses(e, h)),
      ).map((e) => `${e.file} (${e.rule}) ${String(e.detail)}`),
    ).toEqual([])
  })
})

describe('the fixture scan itself', () => {
  it('knows every registered name by its ending, as the file filter assumes', () => {
    expect([...registered].filter((t) => !/(?:Var|3D)$/.test(t))).toEqual([])
  })

  const run = (text: string, file = 'x/fixture.test.ts') => {
    const hits = scanSource(file, text).map((h) => `(${h.rule}) ${h.detail}`)
    // The file filter may pass text that holds no hit, and must never skip
    // text that holds one: the scan parses only what it passes.
    if (hits.length > 0) expect(mayMatch(text, !isTestFile(file))).toBe(true)
    return hits
  }

  it('flags a variation keyed by its type, in every spelling', () => {
    expect(
      run(`
        const a = { variations: { juliaVar: { type: 'juliaVar', weight: 1 } } }
        const b = { variations: { [name]: { type: name, weight: 1 } } }
        const c = { [v.type]: { type: v.type, weight } as Variation }
        variations[type] = { type, weight: 1 }
        Object.fromEntries(names.map((n) => [n, { type: n, weight: 1 }]))
        const d = { id: 'sphericalVar', type: 'sphericalVar', weight: 1 }
      `),
    ).toEqual([
      "(b) juliaVar: { type: 'juliaVar' }",
      '(b) [name]: { type: name }',
      '(b) [v.type]: { type: v.type }',
      '(b) [type] = { type: type }',
      '(b) [n, { type: n }]',
      "(b) id: 'sphericalVar'",
    ])
  })

  it('flags legacy, unknown and made-up custom types', () => {
    expect(
      run(`
        const v = [
          { type: 'linear', weight: 1 },
          { type: 'linearT', weight: 1 },
          { type: 'custom_abc123', weight: 1 },
        ]
      `),
    ).toEqual([
      '(a) linear (legacy: linearVar)',
      '(a) linearT (unregistered)',
      '(a) custom_abc123 (unregistered)',
    ])
  })

  it('flags a string spelled like a variation that is not registered', () => {
    expect(run(`const s = ['vortexVar', 'juliaVar', 'spherical3D']`)).toEqual([
      '(c) vortexVar',
    ])
  })

  it('flags the stray names of a variation table in production code only', () => {
    // One table a file, so that each one has to pass the file filter alone.
    const list = `const LINEAR = new Set(['linear', 'linearVar', 'linearTVar'])`
    const record = `const TO_3D = { spherical: 'spherical3D', sphericalVar: 'spherical3D', bubbleVar: 'bubble3D' }`
    expect(run(list, 'x/production.ts')).toEqual(['(d) LINEAR: linear'])
    expect(run(record, 'x/production.ts')).toEqual(['(d) TO_3D: spherical'])
    expect(run(`${list}\n${record}`, 'x/production.test.ts')).toEqual([])
  })

  it('stays quiet about a realistic flame', () => {
    expect(
      run(`
        const f = {
          variations: {
            [generateVariationId()]: { type: 'juliaVar', weight: 1 },
            v_a1: { type: 'linear3D', weight: 0.5 },
            v_b2: { type: 'custom_5d0c2a4e_91b7_4f3a_a8e6_0b2f7c9d1e34', weight: 1 },
            [\`v_\${name}\`]: { type: name, weight: 1 },
          },
        }
      `),
    ).toEqual([])
  })
})
