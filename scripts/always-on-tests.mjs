// ============================================================
// Tests that a scoped run must never skip
// ============================================================
//
// Data only -- no side effects, nothing to run. Two readers import it:
//
//   scripts/test-changed.mjs                       adds ALWAYS_ON to every
//                                                  scoped selection
//   packages/app/src/alwaysOnTestList.test.ts      fails when a test of the
//                                                  same genre is missing here
//
// It is a separate module precisely so the second reader can exist. A list
// that only the selector reads is a list nobody notices going stale, which is
// how the unenforced Playwright specs rotted (docs/agent/TESTING.md section 4).
//
// `vitest --changed` selects a test file when the module graph joins it to
// something the branch touched. These reach their subject through the
// filesystem instead -- readFileSync, readdirSync, import.meta.glob -- so no
// edge exists and the graph can never select them. `ShellBar.module.test.ts`
// would sit out while `ShellBar.module.css` changed underneath it.
//
// Each entry carries:
//   file    path relative to packages/app
//   why     the reason, for the person deciding whether it can ever be removed
//   genre   'filesystem' -- reads the tree, and the guard test asserts its
//                           detector still flags it. Weaken the detector and
//                           the guard goes red rather than quiet.
//           'breadth'    -- here for coverage, not because it reads the tree.
//                           Not expected to be detected.
// ============================================================

/** @typedef {{ file: string, why: string, genre: 'filesystem' | 'breadth' }} AlwaysOnEntry */
/** @typedef {{ file: string, why: string }} ExemptEntry */

/** @type {ReadonlyArray<AlwaysOnEntry>} */
export const ALWAYS_ON = [
  // Walk every file under src/. Their subject is the whole tree, and the
  // module graph connects them to none of it.
  {
    file: 'src/eagerComputationOrder.test.ts',
    why: 'walks all of src/ with the TypeScript AST for eager-memo temporal dead zones, in one file and across the useWorkspace* hook boundary',
    genre: 'filesystem',
  },
  {
    file: 'src/moduleScopeComputations.test.ts',
    why: 'walks all of src/ for module-scope Solid computations',
    genre: 'filesystem',
  },
  {
    file: 'src/lazyBoundaries.test.ts',
    why: 'walks all of src/ for import() targets that a static import chain from the entry also reaches',
    genre: 'filesystem',
  },
  {
    file: 'src/alwaysOnTestList.test.ts',
    why: 'the guard for this list: walks all of src/ looking for tests that belong on it',
    genre: 'filesystem',
  },
  {
    file: 'src/viewTransitionCallers.test.ts',
    why: 'walks all of src/ for document.startViewTransition calls that bypass lib/viewTransition',
    genre: 'filesystem',
  },
  {
    file: 'src/lib/camera2DRotation.test.ts',
    why: 'walks src/, scripts/ and the landing package for <Camera2D> mounts that omit the view rotation',
    genre: 'filesystem',
  },

  // Read a non-source file the graph has no edge to.
  {
    file: 'src/webmcp/tools/toolCount.test.ts',
    why: 'reads docs/webmcp.md through process.cwd(), so it also needs cwd packages/app',
    genre: 'filesystem',
  },

  // Read a sibling .css or .tsx through the filesystem. Editing the
  // stylesheet alone leaves the test unselected, which is the whole point of
  // the test.
  {
    file: 'src/mainWorkspaceSize.test.ts',
    why: 'reads MainWorkspace.tsx to hold its line count to a shrink-only ratchet',
    genre: 'filesystem',
  },
  {
    file: 'src/launchNotice.test.ts',
    why: 'reads App.tsx and App.module.css',
    genre: 'filesystem',
  },
  {
    file: 'src/components/Shell/ShellBar.module.test.ts',
    why: 'reads ShellBar.module.css',
    genre: 'filesystem',
  },
  {
    file: 'src/components/TouchSurface/EditorRail.module.test.ts',
    why: 'reads EditorRail.module.css',
    genre: 'filesystem',
  },
  {
    file: 'src/components/TouchSurface/tokens.test.ts',
    why: 'readdirSync over the TouchSurface/ and Shell/ stylesheets',
    genre: 'filesystem',
  },
  {
    file: 'src/components/Arcade/pilotOverlayCss.test.ts',
    why: 'reads PilotOverlay.module.css',
    genre: 'filesystem',
  },
  {
    file: 'src/components/Arcade/pilotSpotlightCss.test.ts',
    why: 'reads PilotSpotlight.module.css and PilotOverlay.module.css',
    genre: 'filesystem',
  },
  {
    file: 'src/components/Duel/duelChipsCss.test.ts',
    why: 'reads DuelChips.module.css and DuelChips.tsx',
    genre: 'filesystem',
  },
  {
    file: 'src/components/Home/HomeTab.community.test.ts',
    why: 'reads HomeTab.module.css',
    genre: 'filesystem',
  },
  {
    file: 'src/components/LoadFlameModal/dropzoneStyles.test.ts',
    why: 'reads LoadFlameModal.module.css',
    genre: 'filesystem',
  },
  {
    file: 'src/components/SessionRecorder/SessionRecorderSizing.test.ts',
    why: 'reads four SessionRecorder stylesheets',
    genre: 'filesystem',
  },

  // Enumerate a directory at run time, so a new or edited entry in it is
  // invisible to the graph.
  {
    file: 'src/recorder/synthesize/corpus.test.ts',
    why: 'import.meta.glob over the .flame fixtures it plans, and readdirSync over an external corpus',
    genre: 'filesystem',
  },
  {
    file: 'src/commands/dispatchedCommandIds.test.ts',
    why: 'walks all of src/ for command ids dispatched by name and asks the registry about each',
    genre: 'filesystem',
  },
  {
    file: 'src/hooks/galleryPreviewWiring.test.ts',
    why: 'import.meta.glob over MainWorkspace for how it wires the gallery hover preview',
    genre: 'filesystem',
  },
  {
    file: 'src/recorder/uiCoverageRatchet.test.ts',
    why: 'import.meta.glob over the recorder sources',
    genre: 'filesystem',
  },
  {
    file: 'src/flame/flameXml.golden.test.ts',
    why: 'import.meta.glob over the .flame fixtures',
    genre: 'filesystem',
  },

  // Golden record of the ORDER of random draws across the flame subsystem.
  // Any module pulling from the shared source can move it with no import edge
  // reaching this file.
  {
    file: 'src/flame/breedFlame.golden.test.ts',
    why: 'golden record of breeding draw order across the flame subsystem',
    genre: 'filesystem',
  },

  // Not a filesystem test. On the list because constructing the whole app
  // tree is the cheapest check that a change did not break mounting, and a
  // few seconds is worth it on every pull request.
  {
    file: 'src/App.integration.test.tsx',
    why: 'constructs the whole app tree, so it catches a broken mount whatever caused it',
    genre: 'breadth',
  },
]

/**
 * Tests the guard's detector flags that deliberately do NOT need to run on
 * every pull request -- a test that merely mentions `readFileSync` in a
 * fixture string, say. Empty today, and it should stay hard to add to: an
 * entry here is a promise that the module graph really does reach this test's
 * subject.
 *
 * @type {ReadonlyArray<ExemptEntry>}
 */
export const EXEMPT = []
