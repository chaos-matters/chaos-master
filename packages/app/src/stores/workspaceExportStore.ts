import { createMemo, createSignal } from 'solid-js'
import { getPresetFromQuality } from '@/components/Quality/QualityPresets'
import { DEFAULT_QUALITY, DEFAULT_RESOLUTION } from '@/defaults'
import { hardwareTierToPreset } from '@/utils/hardwareTier'
import type { Accessor, Setter } from 'solid-js'
import type { ExportImageType } from '@/App'
import type { QualityPreset } from '@/components/Quality/QualityPresets'
import type { ExportDimensions } from '@/utils/exportDimensions'
import type { HardwareTier } from '@/utils/hardwareTier'

export interface WorkspaceExportStore {
  qualityPreset: Accessor<QualityPreset>
  setQualityPreset: Setter<QualityPreset>

  pixelRatio: Accessor<number>
  setPixelRatio: Setter<number>

  exportDimensions: Accessor<ExportDimensions | undefined>
  setExportDimensions: Setter<ExportDimensions | undefined>

  canvasPixelRatio: Accessor<number>

  onExportImage: Accessor<ExportImageType | undefined>
  setOnExportImage: Setter<ExportImageType | undefined>

  adaptiveFilterEnabled: Accessor<boolean>
  setAdaptiveFilterEnabled: Setter<boolean>

  stochasticFilterEnabled: Accessor<boolean>
  setStochasticFilterEnabled: Setter<boolean>
}

export function createWorkspaceExportStore(
  hardwareTier?: HardwareTier | null,
): WorkspaceExportStore {
  const initialPreset: QualityPreset = hardwareTier
    ? hardwareTierToPreset(hardwareTier)
    : getPresetFromQuality(DEFAULT_QUALITY)

  const [qualityPreset, setQualityPreset] =
    createSignal<QualityPreset>(initialPreset)
  const [pixelRatio, setPixelRatio] = createSignal(DEFAULT_RESOLUTION)
  const [exportDimensions, setExportDimensions] = createSignal<
    ExportDimensions | undefined
  >()

  const canvasPixelRatio = createMemo(() =>
    exportDimensions() ? 1 : pixelRatio(),
  )

  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()

  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [stochasticFilterEnabled, setStochasticFilterEnabled] =
    createSignal(false)

  return {
    qualityPreset,
    setQualityPreset,
    pixelRatio,
    setPixelRatio,
    exportDimensions,
    setExportDimensions,
    canvasPixelRatio,
    onExportImage,
    setOnExportImage,
    adaptiveFilterEnabled,
    setAdaptiveFilterEnabled,
    stochasticFilterEnabled,
    setStochasticFilterEnabled,
  }
}
