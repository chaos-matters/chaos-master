// What the shared picture of a flame is a picture OF.
//
// A link unfurls to an OG card and a Discord post carries a PNG, and both are
// supposed to show the flame the way the editor shows it -- turned, when the
// camera is turned. Neither renders a flame of its own: both install the
// export-image hook and take the pixels off the live workspace canvas, which
// sits under the 2D camera the workspace hands its view rotation to. So the
// rotation is correct by construction rather than by a prop somebody
// remembered, and nothing until now said so.
//
// That matters because the property is easy to lose by accident. Give either
// capture its own offscreen renderer -- for a square card, say, or to stop
// photographing the sidebar's edge fade -- and it acquires a camera of its
// own, which is a new answer to the question `Camera2D.rotation` asks. This
// test is the tripwire on that refactor.
//
// Read out of the source rather than mounted: `MainWorkspace` is the whole
// editor, a WebGPU root and a dozen contexts, and `CanvasViewport` needs a
// device. Same reason and same `?raw` route as `MainWorkspace.capture.
// test.ts`, which is an ordinary module-graph edge -- so, unlike the tree-
// walking guards, this needs no entry in `scripts/always-on-tests.mjs`.
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import workspaceText from '@/MainWorkspace.tsx?raw'
import viewportText from './CanvasViewport.tsx?raw'

/** The 2D cameras; `Camera3D` answers orientation its own way. */
const CAMERA_2D_TAGS = new Set(['Camera2D', 'WheelZoomCamera2D'])

function parse(name: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    // Parent pointers: finding the camera a canvas sits under means walking
    // UP from the canvas, which is the only direction the question has.
    true,
    ts.ScriptKind.TSX,
  )
}

const viewport = parse('CanvasViewport.tsx', viewportText)
const workspace = parse('MainWorkspace.tsx', workspaceText)

function attribute(
  element: ts.JsxOpeningLikeElement,
  source: ts.SourceFile,
  name: string,
): ts.JsxAttribute | undefined {
  for (const property of element.attributes.properties) {
    if (ts.isJsxAttribute(property) && property.name.getText(source) === name) {
      return property
    }
  }
  return undefined
}

/** Every JSX element in `source` carrying an attribute called `name`. */
function elementsWith(
  source: ts.SourceFile,
  name: string,
): ts.JsxOpeningLikeElement[] {
  const found: ts.JsxOpeningLikeElement[] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      attribute(node, source, name) !== undefined
    ) {
      found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/**
 * The rotation the nearest enclosing 2D camera is given, as written, or
 * `undefined` when no 2D camera encloses this element at all.
 */
function rotationOfEnclosing2DCamera(
  element: ts.Node,
  source: ts.SourceFile,
): string | undefined {
  for (let at = element.parent; at !== undefined; at = at.parent) {
    if (!ts.isJsxElement(at)) continue
    const open = at.openingElement
    if (!CAMERA_2D_TAGS.has(open.tagName.getText(source))) continue
    return attribute(open, source, 'rotation')?.initializer?.getText(source)
  }
  return undefined
}

/** The source text of a named top-level or nested function declaration. */
function functionText(source: ts.SourceFile, name: string): string | undefined {
  let text: string | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(source) === name) {
      text = node.getText(source)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return text
}

describe('the canvas a share capture photographs', () => {
  it('is the one the workspace turns with the flame', () => {
    const captures = elementsWith(viewport, 'onExportImage')
    // One per branch of the 2D/3D fallback; a third would be a canvas nobody
    // has thought about.
    expect(captures).toHaveLength(2)

    const under2D = captures
      .map((capture) => rotationOfEnclosing2DCamera(capture, viewport))
      .filter((rotation) => rotation !== undefined)
    expect(under2D).toHaveLength(1)

    // Not a literal zero, and not any rotation of its own: the memo the
    // workspace builds, which prefers a `camera.rotation` keyframe while the
    // timeline drives the view and falls back to the descriptor's own value.
    expect(under2D[0]).toContain('effectiveRotation')
  })
})

describe('the share captures', () => {
  for (const name of ['captureOgImageBlob', 'shareToDiscord']) {
    it(`${name} takes its pixels off that canvas`, () => {
      const body = functionText(workspace, name)
      expect(body, `${name} is declared in MainWorkspace`).toBeDefined()
      // The export-image hook, which is the live canvas handing over the frame
      // it just drew -- not a renderer of this function's own.
      expect(body).toContain('setOnExportImage(')
    })
  }

  it('render through no camera of their own', () => {
    // The moment either capture grows one, this is the line that says so, and
    // `lib/camera2DRotation.test.ts` is where the new mount has to be answered.
    const mounts = [...CAMERA_2D_TAGS, 'Camera3D'].filter((tag) =>
      workspaceText.includes(`<${tag}`),
    )
    expect(mounts).toEqual([])
  })
})
