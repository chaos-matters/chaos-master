import { createMemo, createRoot } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { clearAllCustomVariations, createCustomVariation, getCustomVariations, importSharedVariations, } from '@/flame/variations/custom'
import { createWorkspaceSelectionStore } from './workspaceSelectionStore'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'

afterEach(() => {
  clearAllCustomVariations()
})

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

      const before = store.customVarsVersion()
      store.bumpCustomVarsVersion()
      expect(store.customVarsVersion()).toBe(before + 1)
      dispose()
    })
  })

  it('lists a custom variation made outside the workspace, as an agent makes one', () => {
    createRoot((dispose) => {
      const store = createWorkspaceSelectionStore()
      // What the sidebar's list does (MainWorkspace customVariationsList).
      const listed = createMemo(() => {
        void store.customVarsVersion()
        return getCustomVariations().map((def) => def.name)
      })
      expect(listed()).not.toContain('Made by an agent')

      // create_custom_variation calls the registry and nothing else.
      createCustomVariation('Made by an agent', 'return vec2f(pos.y, pos.x);')

      expect(listed()).toContain('Made by an agent')
      dispose()
    })
  })

  it('marks a custom variation a flame uses available once a link registers it', () => {
    createRoot((dispose) => {
      const store = createWorkspaceSelectionStore()
      const status = createMemo(() => store.customStatus('custom_from_a_link'))
      expect(status()).toBe('unavailable')

      importSharedVariations([
        {
          id: 'custom_from_a_link',
          name: 'From a link',
          wgsl: 'return vec2f(pos.x, -pos.y);',
        },
      ])

      expect(status()).toBe('available')
      dispose()
    })
  })
})
