import { isThemeChord } from '@/arcade/lockKeyGate'
import { pilotOwnsKeyboard } from '@/arcade/pilot'
import { executeCommand } from '@/commands/registry'
import { animationExportRunning } from '@/flame/renderStats'
import { startViewTransition } from '@/lib/viewTransition'
import { useShortcutManager } from '@/shortcuts'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import type { CommandContext } from '@/commands/types'
import type { Theme } from '@/contexts/ThemeContext'

export interface UseWorkspaceShortcutsParams {
  getCmdContext: () => CommandContext
  sidebarDiffView: () => unknown
  closeSidebarDiff: () => void
  toggleSidebarAsAuthoredAction: () => void
  undoRouter: {
    canUndo: () => boolean
    canRedo: () => boolean
  }
  theme: () => Theme
  setTheme: (theme: Theme) => void
  targetedParameter: () => string | null
  recorderTimeline: {
    removeKeyframe: (path: string, frame: number) => void
    addKeyframeAtCurrentFrame: (path: string) => void
    togglePlay: () => void
  }
  timeline: {
    currentFrame: () => number
  }
  showTimeline: () => boolean
  animationEnabled: () => boolean
}

export function useWorkspaceShortcuts(params: UseWorkspaceShortcutsParams) {
  const {
    getCmdContext,
    sidebarDiffView,
    closeSidebarDiff,
    toggleSidebarAsAuthoredAction,
    undoRouter,
    theme,
    setTheme,
    targetedParameter,
    recorderTimeline,
    timeline,
    showTimeline,
    animationEnabled,
  } = params

  useKeyboardShortcuts({
    Escape: () => {
      if (sidebarDiffView()) {
        closeSidebarDiff()
        return true
      }
    },
    KeyF: (ev) => {
      // Only a bare F is the sidebar's. With a modifier the key belongs to the
      // browser, and claiming it took Ctrl/Cmd+F, find, away from the page.
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return false
      // The layout is the agent's while it owns the screen.
      // Redundant since the key gate (arcade/lockKeyGate.ts) swallows every key
      // under the screen lock before any listener runs; kept until WP9 takes
      // these checks out one at a time, each with its own test.
      if (pilotOwnsKeyboard()) return false
      startViewTransition(toggleSidebarAsAuthoredAction)
      return true
    },
    KeyZ: (ev) => {
      // Undo would rewind the take the agent is making, and record the
      // rewind into it as a step of its own.
      // Redundant since the key gate (arcade/lockKeyGate.ts) swallows every key
      // under the screen lock before any listener runs; kept until WP9 takes
      // these checks out one at a time, each with its own test.
      if (pilotOwnsKeyboard()) return false
      if (animationExportRunning()) return false
      if (ev.metaKey || ev.ctrlKey) {
        if (ev.shiftKey ? !undoRouter.canRedo() : !undoRouter.canUndo()) {
          return false
        }
        executeCommand(
          ev.shiftKey ? 'history.redo' : 'history.undo',
          getCmdContext(),
        )
        return true
      }
    },
    KeyY: (ev) => {
      // Redundant since the key gate (arcade/lockKeyGate.ts) swallows every key
      // under the screen lock before any listener runs; kept until WP9 takes
      // these checks out one at a time, each with its own test.
      if (pilotOwnsKeyboard()) return false
      if (animationExportRunning()) return false
      if (ev.metaKey || ev.ctrlKey) {
        if (!undoRouter.canRedo()) return false
        executeCommand('history.redo', getCmdContext())
        return true
      }
    },
    KeyD: (ev) => {
      // The one key the screen lock lets through, by the same test.
      if (!isThemeChord(ev)) return false
      if (animationExportRunning()) return false
      const toggleTheme = () => {
        setTheme(theme() === 'dark' ? 'light' : 'dark')
      }
      startViewTransition(toggleTheme)
      return true
    },
    KeyI: (ev) => {
      // Ctrl/Cmd+I is the browser's, as Ctrl/Cmd+F is. Alt+I removes a key.
      if (ev.ctrlKey || ev.metaKey) return false
      // A keyframe is an edit of the take the agent is making.
      // Redundant since the key gate (arcade/lockKeyGate.ts) swallows every key
      // under the screen lock before any listener runs; kept until WP9 takes
      // these checks out one at a time, each with its own test.
      if (pilotOwnsKeyboard()) return false
      if (animationExportRunning()) return false
      // Claimed only when there is something to keyframe: with no parameter
      // targeted the key did nothing and still swallowed the press.
      const path = targetedParameter()
      if (!path) return false
      if (ev.altKey) {
        recorderTimeline.removeKeyframe(path, timeline.currentFrame())
      } else {
        recorderTimeline.addKeyframeAtCurrentFrame(path)
      }
      return true
    },
    Space: (ev) => {
      // The playback is the agent's while it owns the screen: Space started
      // and stopped the animation of the take the viewer was only watching.
      // Nothing after this hears it either (the audio panel toggles its track
      // on Space), but the default stays, so a focused Stop button still
      // gets its Space.
      // Redundant since the key gate (arcade/lockKeyGate.ts) swallows every key
      // under the screen lock before any listener runs; kept until WP9 takes
      // these checks out one at a time, each with its own test.
      if (pilotOwnsKeyboard()) {
        ev.stopImmediatePropagation()
        return false
      }
      if (animationExportRunning()) return false
      if (!showTimeline()) return
      if (!animationEnabled()) {
        executeCommand('timeline.setAnimationEnabled', getCmdContext(), true)
      }
      recorderTimeline.togglePlay()
      return true
    },
  })

  useShortcutManager(getCmdContext())
}
