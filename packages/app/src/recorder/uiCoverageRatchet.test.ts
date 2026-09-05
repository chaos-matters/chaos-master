import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import colorAndPaletteSectionSource from '../components/WorkspaceSidebar/ColorAndPaletteSection.tsx?raw'
import randomizerSectionSource from '../components/WorkspaceSidebar/RandomizerSection.tsx?raw'
import renderSettingsSectionSource from '../components/WorkspaceSidebar/RenderSettingsSection.tsx?raw'
import transformsSectionSource from '../components/WorkspaceSidebar/TransformsSection.tsx?raw'
import sidebarSource from '../components/WorkspaceSidebar/WorkspaceSidebar.tsx?raw'
import workspaceSource from '../MainWorkspace.tsx?raw'

const workspacePath = 'src/MainWorkspace.tsx'
const workspaceAst = ts.createSourceFile(
  workspacePath,
  workspaceSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)

const allAstEntries = [
  { path: workspacePath, ast: workspaceAst },
  {
    path: 'src/components/WorkspaceSidebar/WorkspaceSidebar.tsx',
    ast: ts.createSourceFile(
      'src/components/WorkspaceSidebar/WorkspaceSidebar.tsx',
      sidebarSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  },
  {
    path: 'src/components/WorkspaceSidebar/ColorAndPaletteSection.tsx',
    ast: ts.createSourceFile(
      'src/components/WorkspaceSidebar/ColorAndPaletteSection.tsx',
      colorAndPaletteSectionSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  },
  {
    path: 'src/components/WorkspaceSidebar/RandomizerSection.tsx',
    ast: ts.createSourceFile(
      'src/components/WorkspaceSidebar/RandomizerSection.tsx',
      randomizerSectionSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  },
  {
    path: 'src/components/WorkspaceSidebar/TransformsSection.tsx',
    ast: ts.createSourceFile(
      'src/components/WorkspaceSidebar/TransformsSection.tsx',
      transformsSectionSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  },
  {
    path: 'src/components/WorkspaceSidebar/RenderSettingsSection.tsx',
    ast: ts.createSourceFile(
      'src/components/WorkspaceSidebar/RenderSettingsSection.tsx',
      renderSettingsSectionSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  },
]

const allSources = [
  workspaceSource,
  sidebarSource,
  colorAndPaletteSectionSource,
  randomizerSectionSource,
  transformsSectionSource,
  renderSettingsSectionSource,
].join('\n')

/**
 * MainWorkspace owns the final callbacks for most editor controls, but mounting
 * it in Vitest also mounts the WebGPU renderer. This deliberately bounded AST
 * ratchet follows the real JSX props into their named handlers instead: a raw
 * setter substitution fails here without requiring a GPU, browser, or server.
 * Component tests beside the Randomizer and Animation Generator cover the
 * other half of the seam by clicking the visible controls themselves.
 */

function compact(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\{\s+/g, '{')
    .replace(/\s+\}/g, '}')
    .trim()
}

function namedDeclaration(name: string): ts.Node {
  const matches: ts.Node[] = []
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(workspaceAst)
  expect(
    matches,
    `expected exactly one declaration named ${name}`,
  ).toHaveLength(1)
  return matches[0]!
}

function callsWithin(node: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = []
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) calls.push(child)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return calls
}

function jsxOpenings(tagName: string): string[] {
  const matches: string[] = []
  for (const { ast } of allAstEntries) {
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(ast) === tagName
      ) {
        matches.push(compact(node.getText(ast)))
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return matches
}

function expectNamedDeclarationToUse(
  name: string,
  ...fragments: string[]
): void {
  const declaration = namedDeclaration(name)
  const calls = callsWithin(declaration)
  const callText = calls.map((call) => compact(call.getText(workspaceAst)))
  const recorderCall = callText.find((call) =>
    fragments.every((fragment) => call.includes(fragment)),
  )
  expect(
    recorderCall,
    `${name} must retain one recorder call containing ${fragments.join(', ')}`,
  ).toBeDefined()

  const callees = calls.map((call) => call.expression.getText(workspaceAst))
  expect(callees).not.toContain('setFlameDescriptor')
  expect(callees).not.toContain('history.set')
  expect(callees).not.toContain('history.setSilently')
}

function expectSomeOpeningToUse(tagName: string, ...fragments: string[]) {
  const compactFragments = fragments.map(compact)
  const match = jsxOpenings(tagName).find((opening) =>
    compactFragments.every((fragment) => opening.includes(fragment)),
  )
  expect(
    match,
    `${tagName} must keep a visible control wired through ${fragments.join(', ')}`,
  ).toBeDefined()
}

describe('real UI recorder coverage ratchet', () => {
  it('keeps randomize, mutate and load-result workflows value-pinned', () => {
    expectNamedDeclarationToUse(
      'executeFlameLoad',
      "executeCommand('flame.load'",
      'origin',
    )

    const semanticLoads = [
      ['runGenerateFlame', 'flame.randomize'],
      ['runMutateFlame', 'flame.mutate'],
      ['handleLoadHistory', 'flame.history'],
      ['pickSimulatorFlame', 'flame.simulator'],
      ['pickAncestryFlame', 'flame.ancestry'],
    ] as const

    for (const [declaration, origin] of semanticLoads) {
      expectNamedDeclarationToUse(
        declaration,
        'executeFlameLoad(',
        `snapshotOrigin('${origin}')`,
      )
    }

    expectSomeOpeningToUse(
      'FlameRandomizerCard',
      'onGenerateFlame={handleGenerateFlame}',
      'onMutateFlame={handleMutateFlame}',
      'onLoadHistory={handleLoadHistory}',
      "snapshotOrigin('flame.random-gallery')",
    )
    expectSomeOpeningToUse(
      'BreedGallery',
      'onApply=',
      "snapshotOrigin('flame.breed')",
    )
    expectSomeOpeningToUse(
      'EvolutionChamber',
      'onApply=',
      "snapshotOrigin('flame.evolve')",
    )
  })

  it('keeps random and smart animation behind one semantic snapshot', () => {
    expectNamedDeclarationToUse(
      'handleRandomizeAnimation',
      'runTimelineSnapshotMutation(',
      "snapshotOrigin('timeline.random'",
    )
    expectNamedDeclarationToUse(
      'handleSmartAnimation',
      'runTimelineSnapshotMutation(',
      "snapshotOrigin('timeline.smart')",
    )
  })

  it('keeps representative render, palette and color controls command-backed', () => {
    expectNamedDeclarationToUse(
      'setRenderSetting',
      "executeCommand('flame.setRenderSetting'",
    )
    expectNamedDeclarationToUse(
      'handleUpdateRenderSettings',
      "executeCommand('flame.updateRenderSettings'",
    )
    expectNamedDeclarationToUse(
      'handlePaletteSelect',
      "executeCommand('flame.applyPalette'",
    )
    expectNamedDeclarationToUse(
      'handlePaletteUnselect',
      "executeCommand('flame.removePalette'",
    )

    expectSomeOpeningToUse(
      'PaletteSelector',
      'onSelect={handlePaletteSelect}',
      'onUnselect={handlePaletteUnselect}',
    )
    expectSomeOpeningToUse(
      'FlameRandomizerCard',
      'onUpdateRenderSettings={handleUpdateRenderSettings}',
    )
    expectSomeOpeningToUse(
      'Slider',
      'data-tour-target="gamma-slider"',
      "setRenderSetting('gamma'",
    )
    expectSomeOpeningToUse(
      'Slider',
      'data-tour-target="colorSpeed-slider"',
      "executeCommand('flame.setColorSpeed'",
    )
  })

  it('records a sonification stop before user-owned sidebar hides', () => {
    const desktop = compact(
      namedDeclaration('toggleSidebarAsAuthoredAction').getText(workspaceAst),
    )
    expect(desktop).toContain('closeSonificationPanelAsAuthoredAction()')
    expect(desktop).toContain("executeCommand('sidebar.close', cmdContext)")

    const mobile = compact(
      namedDeclaration('hideMobileSidebarAsAuthoredAction').getText(
        workspaceAst,
      ),
    )
    expect(mobile).toContain('closeSonificationPanelAsAuthoredAction()')
    expect(mobile).toContain('setSidebarHidden(true)')

    const keepPlaying = compact(
      namedDeclaration('setKeepPlayingWhenClosedAsAuthoredAction').getText(
        workspaceAst,
      ),
    )
    expect(keepPlaying).toContain(
      "executeCommand('sonification.setEnabled', cmdContext, false)",
    )
    expect(
      keepPlaying.indexOf("executeCommand('sonification.setEnabled'"),
    ).toBeLessThan(keepPlaying.indexOf('setKeepAudioPlayingWhenClosed(keep)'))

    const diff = compact(namedDeclaration('openDiffView').getText(workspaceAst))
    expect(diff).toContain('closeSonificationPanelAsAuthoredAction()')
  })

  it('keeps symmetry-row follow-cam anchors on the dedicated card', () => {
    expect(allSources).toContain('data-focus-id={affineFocusId(tid)}')
    expect(allSources).toContain('data-focus-id={transformVisibilityFocusId(')
  })

  it('keeps document and transport boundaries honest', () => {
    expect(allSources).toContain("'card-randomize',")
    expect(allSources).toContain(
      'data-focus-id={transformColorRandomizeFocusId(',
    )
    expect(allSources).toContain(
      'Loaded animation autoplay is wall-clock transport and is not replayed',
    )
    expect(allSources).toContain(
      'Stop or discard the recording before opening a Home flame',
    )
    expect(allSources).toContain(
      'if (isSessionRecording()) hideMobileSidebarAsAuthoredAction()',
    )
    expect(allSources).toContain('else setSidebarHidden(true)')
    expect(allSources).toContain('primeEffects: (session) =>')
  })
})
