/**
 * Barrel export for all WebMCP tool definitions.
 *
 * Each tool is exported individually for testing, and also collected into
 * a single array for bulk registration by `registerWebMcp.ts`.
 */

import { createClashFlame } from './createClashFlame'
import { diffFlamesTool } from './diffFlames'
import { executeCommandTool } from './executeCommand'
// Read tools
import { getFlame } from './getFlame'
import { getFlameDetail } from './getFlameDetail'
import { getUndoState } from './getUndoState'
import { listCommands } from './listCommands'
import { mutateFlame } from './mutateFlame'
import { openArena } from './openArena'
import { randomizeFlame } from './randomizeFlame'
import { scoreFlame } from './scoreFlame'
// Write tools
import { setFlame } from './setFlame'
import { createShareLink, loadShareLink } from './shareLink'
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
}

/** All Tier 1 tools, in registration order. */
export const allTools: readonly WebMcpTool[] = [
  // Read tools first (safe, no side effects)
  getFlame,
  getFlameDetail,
  listCommands,
  getUndoState,
  diffFlamesTool,
  createShareLink,
  // Write tools
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
]
