import { FlameRandomizerCard } from '@/components/FlameRandomizerCard/FlameRandomizerCard'
import { snapshotOrigin } from '@/recorder/snapshotOrigin'
import type { Accessor } from 'solid-js'
import type { FlameRandomizerCardProps } from '@/components/FlameRandomizerCard/FlameRandomizerCard'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SnapshotOrigin } from '@/recorder/snapshotOrigin'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { RandomizerHistoryEntry } from '@/utils/randomizerHistoryDB'

export interface RandomizerSectionProps {
  randomizerCardRef?: (el: HTMLDivElement) => void
  flame: FlameDescriptor
  open: Accessor<boolean>
  onToggleOpen: () => void
  expandAnimationEpoch: Accessor<number>
  historyEntries: Accessor<RandomizerHistoryEntry[]>
  selectedTimestamp: Accessor<number>
  handleGenerateFlame: FlameRandomizerCardProps['onGenerateFlame']
  handleMutateFlame: FlameRandomizerCardProps['onMutateFlame']
  handleLoadHistory: (entry: RandomizerHistoryEntry) => void
  onClearHistory: () => void
  onRandomizeAnimation: (presetIds: string[], clearFirst: boolean) => void
  onSmartAnimation: (clearFirst: boolean) => void
  handleUpdateRenderSettings: (
    settings: Partial<FlameDescriptor['renderSettings']>,
  ) => void
  onApplyCandidate: (flame: FlameDescriptor, origin: SnapshotOrigin) => void
  hardwareTier?: HardwareTier | null
  isBusy: Accessor<boolean>
}

export function RandomizerSection(props: RandomizerSectionProps) {
  const {
    handleGenerateFlame,
    handleMutateFlame,
    handleLoadHistory,
    handleUpdateRenderSettings,
  } = props

  return (
    <div ref={props.randomizerCardRef} data-tour-target="randomizer-card">
      <FlameRandomizerCard
        flame={props.flame}
        open={props.open()}
        onToggleOpen={props.onToggleOpen}
        expandAnimationEpoch={props.expandAnimationEpoch()}
        historyEntries={props.historyEntries()}
        selectedTimestamp={props.selectedTimestamp()}
        onGenerateFlame={handleGenerateFlame}
        onMutateFlame={handleMutateFlame}
        onLoadHistory={handleLoadHistory}
        onClearHistory={props.onClearHistory}
        onRandomizeAnimation={props.onRandomizeAnimation}
        onSmartAnimation={props.onSmartAnimation}
        onUpdateRenderSettings={handleUpdateRenderSettings}
        onApplyCandidate={(candidateFlame) => {
          props.onApplyCandidate(
            candidateFlame,
            snapshotOrigin('flame.random-gallery'),
          )
        }}
        hardwareTier={props.hardwareTier}
        isBusy={props.isBusy()}
      />
    </div>
  )
}
