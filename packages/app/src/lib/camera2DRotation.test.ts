// Guards against a 2D camera mounted without deciding about `rotation`.
//
// `camera.rotation` reaches the renderer through the view matrix and nowhere
// else, so a mount that leaves the prop off silently renders the flame
// un-turned. That was invisible while nothing rotated; once the offline
// renderer started honouring rotation, the export dialog's preview strip and
// the video it queues disagreed on a flame with a `camera.rotation` track —
// the one case the rotation work exists for.
//
// The prop is required in TypeScript, which is the real fix. This test is the
// same rule stated as behaviour rather than as a type, and it is what carries
// the decision: every site either passes the flame's own rotation or passes a
// literal zero, and a zero is a sentence somebody wrote rather than a prop
// somebody forgot.
//
// It carries the second half of that decision by NAME. Presence alone was not
// enough: the prop being spelled says nothing about which answer a mount gave,
// so the square-on views existed only as a sentence in a pull request, and a
// reader looking for "the share card" among them found `ShareVariationModal`
// and took it for a picture of a flame. It is not one -- see `SQUARE_ON`. The
// list below is the enumeration that was missing, and either direction fails
// it: a view that starts turning, or a new one that quietly does not.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const APP = join(import.meta.dirname, '..', '..')
const PACKAGES = join(APP, '..')
/**
 * Every tree that mounts these components, not just `src/`: the poster capture
 * lives in `scripts/` and the landing page imports the app's cameras wholesale,
 * and both were missing a rotation the app's own mounts already had.
 */
const ROOTS = [
  join(APP, 'src'),
  join(APP, 'scripts'),
  join(PACKAGES, 'landing', 'src'),
]

/** Everything that builds the 2D view matrix for a subtree. */
const CAMERA_TAGS = new Set(['Camera2D', 'WheelZoomCamera2D'])

/**
 * The views that show a flame square-on however the camera is turned, and why
 * each one is entitled to.
 *
 * Every one of them frames something of its own -- its own zoom, its own
 * origin -- because you are editing a property of the flame rather than
 * looking at the view. None of them is a picture anybody shares or exports;
 * the surfaces that ARE go through the workspace canvas and turn with it
 * (`components/CanvasViewport/shareCapture.test.ts`).
 *
 * Keyed by file because each of these mounts one camera and the count is
 * asserted; a line number would churn on every edit above it.
 */
const SQUARE_ON: Readonly<Record<string, string>> = {
  'src/components/AffineEditor/AffineEditor.tsx':
    'the grid tab manipulates the pre-affine on its own axes; turning it would turn the handles away from the numbers they set',
  'src/components/FlameColorEditor/FlameColorEditor.tsx':
    'the gradient editor has its own zoom and position, like the affine grid',
  'src/components/CustomVariationEditor/CustomVariationEditor.tsx':
    'a fixed preview frame for the WGSL being authored, at zoom 1 on the origin',
  'src/components/LogoFaviconGenerator/LogoFaviconGenerator.tsx':
    'the generator frames the mark itself at zoom 1 on the origin, not the flame as the editor shows it',
  'src/components/ShareVariationModal/ShareVariationModal.tsx':
    'previews a shared custom VARIATION -- a synthetic one-transform flame minted by makeCustomVariationPreviewFlame, with no camera of its own to inherit. It is not a picture of anyone’s flame, and nothing captures this canvas',
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(name))
      acc.push(full)
  }
  return acc
}

/**
 * A rotation that is a literal zero, however it is spelled.
 *
 * `Camera2D` takes a number and `WheelZoomCamera2D` an accessor, so the same
 * answer appears as `rotation={0}` and as `rotation={() => 0}`. Anything else
 * -- a member expression, a call, a memo -- is a mount reading a rotation from
 * somewhere, which is the other answer.
 */
function isSquareOn(initializer: ts.JsxAttributeValue | undefined): boolean {
  if (initializer === undefined || !ts.isJsxExpression(initializer))
    return false
  const { expression } = initializer
  if (expression === undefined) return false
  const body = ts.isArrowFunction(expression) ? expression.body : expression
  return ts.isNumericLiteral(body) && Number(body.text) === 0
}

type Mount = { at: string; file: string; squareOn: boolean; named: boolean }

function cameraMounts(file: string): Mount[] {
  const text = readFileSync(file, 'utf8')
  if (![...CAMERA_TAGS].some((tag) => text.includes(`<${tag}`))) return []
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const found: Mount[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source)
      if (CAMERA_TAGS.has(tag)) {
        const rotation = node.attributes.properties.find(
          (property) =>
            ts.isJsxAttribute(property) &&
            property.name.getText(source) === 'rotation',
        )
        const { line } = source.getLineAndCharacterOfPosition(node.getStart())
        found.push({
          at: `${relative(APP, file)}:${line + 1}: <${tag}>`,
          file: relative(APP, file),
          named: rotation !== undefined,
          squareOn:
            rotation !== undefined &&
            ts.isJsxAttribute(rotation) &&
            isSquareOn(rotation.initializer),
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

const MOUNTS = ROOTS.flatMap((root) => sourceFiles(root)).flatMap(cameraMounts)

describe('2D camera mounts', () => {
  it('every one says what the view rotation is', () => {
    expect(MOUNTS.filter((mount) => !mount.named).map((m) => m.at)).toEqual([])
  })

  it('the ones that stay square-on are exactly the ones we decided on', () => {
    // Sorted so the failure reads as a set difference rather than as a diff of
    // whatever order the directory walk happened to produce.
    const squareOn = MOUNTS.filter((mount) => mount.squareOn)
      .map((mount) => mount.file)
      .sort()
    expect(squareOn).toEqual(Object.keys(SQUARE_ON).sort())
  })

  it('names one camera per square-on view, so a second cannot hide', () => {
    const counts = new Map<string, number>()
    for (const mount of MOUNTS.filter((m) => m.squareOn)) {
      counts.set(mount.file, (counts.get(mount.file) ?? 0) + 1)
    }
    expect([...counts].filter(([, n]) => n !== 1)).toEqual([])
  })

  it('gives a reason for every one of them', () => {
    const unexplained = Object.entries(SQUARE_ON)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([file]) => file)
    expect(unexplained).toEqual([])
  })
})
