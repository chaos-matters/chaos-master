import { CollapsibleCard } from '@/components/CollapsibleCard/CollapsibleCard'
import { ColorEditor } from '@/components/FlameColorEditor/ColorEditor'
import { PaletteSelector } from '@/components/PaletteSelector/PaletteSelector'
import type { Accessor } from 'solid-js'
import type { ColorEditOrigin } from '@/components/FlameColorEditor/FlameColorEditor'
import type { Palette } from '@/flame/colorMap'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { ReplayColorView } from '@/recorder/focusPreparation'
import type { HistorySetter } from '@/utils/createStoreHistory'

export interface ColorAndPaletteSectionProps {
  colorCardOpen: Accessor<boolean>
  onToggleColorCardOpen: () => void
  paletteCardOpen: Accessor<boolean>
  onTogglePaletteCardOpen: () => void
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
  setTransformColor: (
    tid: string,
    x: number,
    y: number,
    origin?: ColorEditOrigin,
  ) => void
  selectedTransformId: Accessor<string | null>
  setSelectedTransformId: (id: string | null) => void
  replayColorViewRequest: Accessor<{ view: ReplayColorView; epoch: number }>
  onColorViewChange: (view: ReplayColorView) => void
  selectedPaletteId: Accessor<string>
  handlePaletteSelect: (palette: Palette) => void
  handlePaletteUnselect: () => void
}

export function ColorAndPaletteSection(props: ColorAndPaletteSectionProps) {
  const { handlePaletteSelect, handlePaletteUnselect } = props

  return (
    <>
      <CollapsibleCard
        title="Color"
        open={props.colorCardOpen()}
        onToggleOpen={props.onToggleColorCardOpen}
      >
        <div>
          <ColorEditor
            transforms={props.transforms}
            setTransforms={props.setTransforms}
            setTransformColor={props.setTransformColor}
            selectedTransformId={props.selectedTransformId}
            setSelectedTransformId={props.setSelectedTransformId}
            enableChangeTracking
            replayViewRequest={props.replayColorViewRequest}
            onViewChange={props.onColorViewChange}
          />
        </div>
      </CollapsibleCard>
      <CollapsibleCard
        title="Palette"
        open={props.paletteCardOpen()}
        onToggleOpen={props.onTogglePaletteCardOpen}
      >
        <div data-tour-target="palette-selector">
          <PaletteSelector
            selectedPaletteId={props.selectedPaletteId()}
            onSelect={handlePaletteSelect}
            onUnselect={handlePaletteUnselect}
          />
        </div>
      </CollapsibleCard>
    </>
  )
}
