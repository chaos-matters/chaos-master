import { createMemo, createSignal } from 'solid-js'
import { runPaletteRestoreTransition } from '@/recorder/replayPaletteState'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'

export interface UseWorkspacePaletteParams {
  flameDescriptor: FlameDescriptor
  history: Pick<ChangeHistory<FlameDescriptor>, 'startPreview' | 'commit'>
}

export function useWorkspacePalette(params: UseWorkspacePaletteParams) {
  const { flameDescriptor, history } = params

  const [prePaletteColors, setPrePaletteColors] = createSignal<
    Record<string, { x: number; y: number }>
  >({})

  const withPaletteRestoreTransition = (
    after: Record<string, { x: number; y: number }>,
    description: string,
    writeDocument: () => void,
  ) => {
    runPaletteRestoreTransition(
      history,
      prePaletteColors(),
      after,
      (colors) => setPrePaletteColors(colors),
      description,
      writeDocument,
    )
  }

  const selectedPalette = createMemo<Palette | undefined>(() => {
    const stored = flameDescriptor.renderSettings.palette
    if (!stored) return undefined
    return {
      id: stored.id,
      name: stored.name,
      entries: stored.entries.map((entry) => ({ ...entry })),
      source: 'imported',
    }
  })

  const selectedPaletteId = () =>
    flameDescriptor.renderSettings.palette?.id ?? ''

  return {
    prePaletteColors,
    setPrePaletteColors,
    withPaletteRestoreTransition,
    selectedPalette,
    selectedPaletteId,
  }
}
