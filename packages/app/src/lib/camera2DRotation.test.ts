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

function mountsWithoutRotation(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  if (![...CAMERA_TAGS].some((tag) => text.includes(`<${tag}`))) return []
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const offenders: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source)
      if (CAMERA_TAGS.has(tag)) {
        const named = node.attributes.properties.some(
          (property) =>
            ts.isJsxAttribute(property) &&
            property.name.getText(source) === 'rotation',
        )
        if (!named) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart())
          offenders.push(`${relative(APP, file)}:${line + 1}: <${tag}>`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return offenders
}

describe('2D camera mounts', () => {
  it('every one says what the view rotation is', () => {
    const offenders = ROOTS.flatMap((root) => sourceFiles(root)).flatMap(
      mountsWithoutRotation,
    )
    expect(offenders).toEqual([])
  })
})
