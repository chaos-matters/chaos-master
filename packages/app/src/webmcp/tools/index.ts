/**
 * Barrel export for all WebMCP tool definitions.
 *
 * Each tool is exported individually for testing, and also collected into
 * a single array for bulk registration by `registerWebMcp.ts`.
 */

import { animateClash } from './animateClash'
import { arcadeEndLesson, arcadeNarrate, arcadeStartLesson, arcadeStatus, } from './arcadeTeach'
import { breedFlamesTool } from './breedFlames'
import { createClashFlame } from './createClashFlame'
import { createCustomVariationTool } from './createCustomVariation'
import { diffFlamesTool } from './diffFlames'
import { executeCommandTool } from './executeCommand'
// Read tools
import { getFlame } from './getFlame'
import { getFlameDetail } from './getFlameDetail'
import { getUndoState } from './getUndoState'
import { listCommands } from './listCommands'
import { mutateFlame } from './mutateFlame'
import { openArena } from './openArena'
import { openArtDirector } from './openArtDirector'
import { randomizeFlame } from './randomizeFlame'
import { scoreClashRound } from './scoreClashRound'
import { scoreFlame } from './scoreFlame'
// Write tools
import { setFlame } from './setFlame'
import { createShareLink, loadShareLink } from './shareLink'
import { simulateClash } from './simulateClash'
import { redo, undo } from './undoRedo'
import type { WebMcpTool } from '@/webmcp/types'

// Re-export individuals for direct test imports
export {
  getFlame,
  getFlameDetail,
  getUndoState,
  listCommands,
  diffFlamesTool,
  createShareLink,
  setFlame,
  randomizeFlame,
  mutateFlame,
  executeCommandTool,
  undo,
  redo,
  loadShareLink,
  scoreFlame,
  createClashFlame,
  openArena,
  openArtDirector,
  breedFlamesTool,
  createCustomVariationTool,
  scoreClashRound,
  simulateClash,
  animateClash,
  arcadeStatus,
  arcadeStartLesson,
  arcadeNarrate,
  arcadeEndLesson,
}

/** All Tier 1 tools, in registration order. */
export const allTools: readonly WebMcpTool[] = [
  // Read tools first (safe, no side effects)
  getFlame,
  getFlameDetail,
  listCommands,
  getUndoState,
  arcadeStatus,
  diffFlamesTool,
  createShareLink,
  scoreFlame,
  scoreClashRound,
  simulateClash,
  // Write tools
  setFlame,
  randomizeFlame,
  mutateFlame,
  executeCommandTool,
  arcadeStartLesson,
  arcadeNarrate,
  arcadeEndLesson,
  undo,
  redo,
  loadShareLink,
  createClashFlame,
  openArena,
  openArtDirector,
  breedFlamesTool,
  createCustomVariationTool,
  animateClash,
]
