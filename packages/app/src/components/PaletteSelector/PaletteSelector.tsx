import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import { CustomPaletteEditor } from '@/components/CustomPaletteEditor/CustomPaletteEditor'
import { deleteCustomPalette, loadCustomPalettes, saveCustomPalettes, } from '@/flame/colorMap'
import { flam3PaletteToPalette, loadOfficialPalettes, parseFlam3Palettes, } from '@/flame/flam3PaletteParser'
import { defaultPalettes, paletteToGradientCSS } from '@/flame/palettes'
import ui from './PaletteSelector.module.css'
import type { Palette } from '@/flame/colorMap'

type PaletteSelectorProps = {
  selectedPaletteId: string
  onSelect: (palette: Palette) => void
}

export function PaletteSelector(props: PaletteSelectorProps) {
  const [showCustom, setShowCustom] = createSignal(false)
  const [customPalette, setCustomPalette] = createSignal<Palette | undefined>(
    undefined,
  )
  const [_forceUpdate, setForceUpdate] = createSignal(0)
  const [officialPalettes, setOfficialPalettes] = createSignal<Palette[]>([])
  const [loadedCount, setLoadedCount] = createSignal(20)

  onMount(async () => {
    const loaded = await loadOfficialPalettes()
    setOfficialPalettes(loaded)
  })

  // Batch-loaded official palettes — createMemo so the component re-renders when officialPalettes loads
  const displayedOfficialPalettes = createMemo(() =>
    officialPalettes().slice(0, loadedCount()),
  )
  const hasMoreOfficialPalettes = createMemo(
    () => loadedCount() < officialPalettes().length,
  )

  const loadMore = () => setLoadedCount((c) => c + 20)

  const customPalettes = () => {
    void _forceUpdate()
    return loadCustomPalettes()
  }

  // All palettes excluding custom (custom is rendered separately)
  const allNonCustomPalettes = () => {
    void _forceUpdate()
    return [...defaultPalettes, ...displayedOfficialPalettes()]
  }

  // Full count including custom
  const totalCount = () =>
    officialPalettes().length + defaultPalettes.length + customPalettes().length

  const handleDelete = (e: MouseEvent, palette: Palette) => {
    e.stopPropagation()
    if (palette.source !== 'custom' && palette.source !== 'imported') return
    if (!confirm(`Delete palette "${palette.name}"?`)) return
    deleteCustomPalette(palette.id)
    setForceUpdate((n) => n + 1)
    // Deselect if the deleted palette was selected
    if (props.selectedPaletteId === palette.id) {
      const all = [
        ...defaultPalettes,
        ...displayedOfficialPalettes(),
        ...customPalettes(),
      ]
      props.onSelect(all[0]!)
    }
  }

  const handleImportPalettes = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xml,application/xml,text/xml'
    input.multiple = true
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      if (files.length === 0) return

      try {
        let importedCount = 0
        for (const file of files) {
          const text = await file.text()
          const flam3Palettes = parseFlam3Palettes(text)
          const palettes = flam3Palettes.map(flam3PaletteToPalette)
          const existing = loadCustomPalettes()
          saveCustomPalettes([...existing, ...palettes])
          importedCount += palettes.length
        }
        setForceUpdate((n) => n + 1)
        console.info(`Imported ${importedCount} palettes`)
      } catch (err) {
        console.error('Failed to import palettes:', err)
      }
    }
    input.click()
  }

  const handleNewCustom = () => {
    setCustomPalette(undefined)
    setShowCustom(true)
  }

  const handleEditCustom = (palette: Palette) => {
    setCustomPalette(palette)
    setShowCustom(true)
  }

  const handleSaveCustom = (palette: Palette) => {
    setShowCustom(false)
    setCustomPalette(undefined)
    setForceUpdate((n) => n + 1)
    props.onSelect(palette)
  }

  const handleCancelCustom = () => {
    setShowCustom(false)
    setCustomPalette(undefined)
  }

  return (
    <div class={ui.selector}>
      <div class={ui.header}>
        <span class={ui.label}>Palettes</span>
        <span class={ui.count}>{totalCount()}</span>
      </div>

      <Show when={!showCustom()}>
        <div class={ui.gallery}>
          {/* New custom palette */}
          <button
            class={ui.paletteButton}
            onClick={handleNewCustom}
            title="Create a new custom palette"
          >
            <div class={ui.previewCustom}>
              <span class={ui.customIcon}>+</span>
            </div>
            <span class={ui.name}>New</span>
          </button>

          {/* Custom palettes — rendered as divs with inner buttons to avoid invalid nested button HTML */}
          <For each={customPalettes()}>
            {(palette) => (
              <div
                class={ui.paletteButton}
                classList={{
                  [ui.selected as string]:
                    props.selectedPaletteId === palette.id,
                }}
                onClick={() => {
                  props.onSelect(palette)
                }}
                onDblClick={() => {
                  handleEditCustom(palette)
                }}
                title={`${palette.name} (double-click to edit)`}
              >
                <div
                  class={ui.preview}
                  style={{ background: paletteToGradientCSS(palette) }}
                />
                <span class={ui.name}>{palette.name}</span>
                <span
                  class={ui.deleteBtn}
                  onClick={(e) => {
                    handleDelete(e, palette)
                  }}
                  title="Delete palette"
                  role="button"
                >
                  ×
                </span>
              </div>
            )}
          </For>

          {/* Default + official palettes */}
          <For each={allNonCustomPalettes()}>
            {(palette) => (
              <div
                class={ui.paletteButton}
                classList={{
                  [ui.selected as string]:
                    props.selectedPaletteId === palette.id,
                }}
                onClick={() => {
                  props.onSelect(palette)
                }}
                title={palette.name}
              >
                <div
                  class={ui.preview}
                  style={{ background: paletteToGradientCSS(palette) }}
                />
                <span class={ui.name}>{palette.name}</span>
              </div>
            )}
          </For>
        </div>

        {/* Load More for official palettes */}
        <Show when={hasMoreOfficialPalettes()}>
          <button class={ui.importBtn} onClick={loadMore}>
            Load More ({officialPalettes().length - loadedCount()} remaining)
          </button>
        </Show>

        {/* Import button */}
        <button class={ui.importBtn} onClick={handleImportPalettes}>
          Import flam3 Palettes
        </button>
      </Show>

      <Show when={showCustom()}>
        <CustomPaletteEditor
          initialPalette={customPalette()}
          onSave={handleSaveCustom}
          onCancel={handleCancelCustom}
          onDelete={handleCancelCustom}
        />
      </Show>
    </div>
  )
}
