import ui from '@/App.module.css'
import { AffineEditor } from '@/components/AffineEditor/AffineEditor'
import { CollapsibleCard } from '@/components/CollapsibleCard/CollapsibleCard'
import type { Accessor } from 'solid-js'
import type { AffineParams } from '@/flame/affineTranform'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { ReplayAffineMode, ReplayAffineTab, } from '@/recorder/focusPreparation'
import type { HistorySetter } from '@/utils/createStoreHistory'

export interface AffineEditorSectionProps {
  open: Accessor<boolean>
  onToggleOpen: () => void
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
  setTransformAffine: (
    tid: string,
    which: 'pre' | 'post',
    affine: AffineParams,
    origin?: 'grid' | 'randomize' | 'reset',
  ) => void
  setAffineCoefficient: (
    tid: string,
    which: 'pre' | 'post',
    key: string,
    value: number,
  ) => void
  finalTransform: AffineParams | undefined
  setFinalTransform: (
    affine: AffineParams,
    origin?: 'grid' | 'randomize',
  ) => void
  setFinalAffineCoefficient: (key: string, value: number) => void
  is3D: boolean
  selectedTransformId: Accessor<string | null>
  setSelectedTransformId: (id: string | null) => void
  replayModeRequest: Accessor<{
    mode: ReplayAffineMode
    tab: ReplayAffineTab
    epoch: number
  }>
  onEditorStateChange: (state: {
    mode: ReplayAffineMode
    tab: ReplayAffineTab
  }) => void
}

export function AffineEditorSection(props: AffineEditorSectionProps) {
  return (
    <CollapsibleCard
      title="Affine"
      open={props.open()}
      onToggleOpen={props.onToggleOpen}
    >
      <AffineEditor
        class={ui.affineEditor}
        transforms={props.transforms}
        setTransforms={props.setTransforms}
        setTransformAffine={props.setTransformAffine}
        setAffineCoefficient={props.setAffineCoefficient}
        finalTransform={props.finalTransform}
        setFinalTransform={props.setFinalTransform}
        setFinalAffineCoefficient={props.setFinalAffineCoefficient}
        is3D={props.is3D}
        selectedTransformId={props.selectedTransformId}
        setSelectedTransformId={props.setSelectedTransformId}
        enableChangeTracking
        replayModeRequest={props.replayModeRequest}
        onEditorStateChange={props.onEditorStateChange}
      />
    </CollapsibleCard>
  )
}
