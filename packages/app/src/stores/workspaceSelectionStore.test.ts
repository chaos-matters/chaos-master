import { createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createWorkspaceSelectionStore } from './workspaceSelectionStore'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'

describe('workspaceSelectionStore', () => {
  it('toggles transform selection', () => {
    createRoot((dispose) => {
      const store = createWorkspaceSelectionStore()
      expect(store.selectedTransformId()).toBeNull()

      store.toggleSelectedTransform('t1')
      expect(store.selectedTransformId()).toBe('t1')

      // Clicking again clears selection
      store.toggleSelectedTransform('t1')
      expect(store.selectedTransformId()).toBeNull()

      store.toggleSelectedTransform('t2')
      expect(store.selectedTransformId()).toBe('t2')
      dispose()
    })
  })

  it('manages collapsed transforms', () => {
    createRoot((dispose) => {
      const store = createWorkspaceSelectionStore()
      const tids = ['t1', 't2', 't3']

      expect(store.anyTransformOpen(tids)).toBe(true)
      store.toggleTransformCollapsed('t1')
      expect(store.collapsedTransforms().has('t1')).toBe(true)

      // Collapse all
      store.toggleCollapseAllTransforms(tids)
      expect(store.collapsedTransforms().size).toBe(3)
      expect(store.anyTransformOpen(tids)).toBe(false)

      // Expand all
      store.toggleCollapseAllTransforms(tids)
      expect(store.collapsedTransforms().size).toBe(0)
      expect(store.anyTransformOpen(tids)).toBe(true)
      dispose()
    })
  })

  it('handles quick pick state and version bumps', () => {
    createRoot((dispose) => {
      const store = createWorkspaceSelectionStore()
      expect(store.quickPickState()).toBeNull()

      store.setQuickPickState({
        tid: 't1' as TransformId,
        vid: 'v1' as VariationId,
        type: 'linear',
      })
      expect(store.quickPickState()?.type).toBe('linear')

      expect(store.customVarsVersion()).toBe(0)
      store.bumpCustomVarsVersion()
      expect(store.customVarsVersion()).toBe(1)
      dispose()
    })
  })
})
