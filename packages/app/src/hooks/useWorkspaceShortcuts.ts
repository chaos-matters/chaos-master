import { executeCommand } from '@/commands/registry'
import { animationExportRunning } from '@/flame/renderStats'
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
    KeyF: () => {
      if ('startViewTransition' in document) {
        document.startViewTransition(toggleSidebarAsAuthoredAction)
      } else {
        toggleSidebarAsAuthoredAction()
      }
      return true
    },
    KeyZ: (ev) => {
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
      if (animationExportRunning()) return false
      if (ev.metaKey || ev.ctrlKey) {
        if (!undoRouter.canRedo()) return false
        executeCommand('history.redo', getCmdContext())
        return true
      }
    },
    KeyD: (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return false
      if (animationExportRunning()) return false
      const toggleTheme = () => {
        setTheme(theme() === 'dark' ? 'light' : 'dark')
      }
      if ('startViewTransition' in document) {
        document.startViewTransition(toggleTheme)
      } else {
        toggleTheme()
      }
      return true
    },
    KeyI: (ev) => {
      if (animationExportRunning()) return false
      if (ev.altKey) {
        const path = targetedParameter()
        if (path) {
          recorderTimeline.removeKeyframe(path, timeline.currentFrame())
        }
      } else {
        const path = targetedParameter()
        if (path) {
          recorderTimeline.addKeyframeAtCurrentFrame(path)
        }
      }
      return true
    },
    Space: () => {
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
