import { createSignal } from 'solid-js'
import { isCustomVariationRegistered } from '@/flame/variations/custom'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Accessor, Setter } from 'solid-js'
import type { QuickPickerMode } from '@/components/QuickVariationPicker/QuickVariationPicker'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'
import type { CustomVariationDef } from '@/flame/variations/custom/types'
import type { TransformVariationType3D } from '@/flame/variations3D'

export type QuickPickState = {
  tid: TransformId
  vid: VariationId
  type: TransformVariationType | TransformVariationType3D
} | null

export interface WorkspaceSelectionStore {
  selectedTransformId: Accessor<string | null>
  setSelectedTransformId: Setter<string | null>
  toggleSelectedTransform: (tid: string) => void

  collapsedTransforms: Accessor<Set<string>>
  setCollapsedTransforms: Setter<Set<string>>
  toggleTransformCollapsed: (tid: string) => void
  toggleCollapseAllTransforms: (visibleTids: string[]) => void
  anyTransformOpen: (visibleTids: string[]) => boolean

  quickPickState: Accessor<QuickPickState>
  setQuickPickState: Setter<QuickPickState>
  quickPickerMode: Accessor<QuickPickerMode>
  setQuickPickerMode: (mode: QuickPickerMode) => void

  hoveredVariationType: Accessor<
    TransformVariationType | TransformVariationType3D | null
  >
  setHoveredVariationType: Setter<
    TransformVariationType | TransformVariationType3D | null
  >
  hoveredCustomVarDef: Accessor<CustomVariationDef | null>
  setHoveredCustomVarDef: Setter<CustomVariationDef | null>

  customVarsVersion: Accessor<number>
  setCustomVarsVersion: Setter<number>
  bumpCustomVarsVersion: () => void
  customStatus: (type: string) => 'none' | 'available' | 'unavailable'
}

export function createWorkspaceSelectionStore(): WorkspaceSelectionStore {
  const [selectedTransformId, setSelectedTransformId] = createSignal<
    string | null
  >(null)
  const toggleSelectedTransform = (tid: string) =>
    setSelectedTransformId((prev) => (prev === tid ? null : tid))

  const [collapsedTransforms, setCollapsedTransforms] = createSignal<
    Set<string>
  >(new Set())

  const anyTransformOpen = (visibleTids: string[]) =>
    visibleTids.some((tid) => !collapsedTransforms().has(tid))

  const toggleCollapseAllTransforms = (visibleTids: string[]) => {
    setCollapsedTransforms(
      anyTransformOpen(visibleTids) ? new Set(visibleTids) : new Set<string>(),
    )
  }

  const toggleTransformCollapsed = (tid: string) => {
    setCollapsedTransforms((prev) => {
      const next = new Set(prev)
      if (next.has(tid)) next.delete(tid)
      else next.add(tid)
      return next
    })
  }

  const [quickPickerMode, setQuickPickerMode] =
    persistentSignal<QuickPickerMode>('quick-picker-mode', 'list')

  const [quickPickState, setQuickPickState] = createSignal<QuickPickState>(null)
  const [hoveredVariationType, setHoveredVariationType] = createSignal<
    TransformVariationType | TransformVariationType3D | null
  >(null)
  const [hoveredCustomVarDef, setHoveredCustomVarDef] =
    createSignal<CustomVariationDef | null>(null)

  const [customVarsVersion, setCustomVarsVersion] = createSignal(0)
  const bumpCustomVarsVersion = () => setCustomVarsVersion((v) => v + 1)

  function customStatus(type: string): 'none' | 'available' | 'unavailable' {
    if (!type.startsWith('custom_')) return 'none'
    void customVarsVersion()
    return isCustomVariationRegistered(type) ? 'available' : 'unavailable'
  }

  return {
    selectedTransformId,
    setSelectedTransformId,
    toggleSelectedTransform,
    collapsedTransforms,
    setCollapsedTransforms,
    toggleTransformCollapsed,
    toggleCollapseAllTransforms,
    anyTransformOpen,
    quickPickState,
    setQuickPickState,
    quickPickerMode,
    setQuickPickerMode,
    hoveredVariationType,
    setHoveredVariationType,
    hoveredCustomVarDef,
    setHoveredCustomVarDef,
    customVarsVersion,
    setCustomVarsVersion,
    bumpCustomVarsVersion,
    customStatus,
  }
}
