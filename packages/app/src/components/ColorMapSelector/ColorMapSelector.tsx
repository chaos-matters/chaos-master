import { For } from 'solid-js'
import { defaultColorMaps } from '@/flame/colorMap'
import { oklabToRgbForCss } from '@/flame/colors'
import ui from './ColorMapSelector.module.css'
import type { ColorMap } from '@/flame/colorMap'

type ColorMapSelectorProps = {
  selectedColorMapId: string
  onSelect: (colorMap: ColorMap) => void
}

export function ColorMapSelector(props: ColorMapSelectorProps) {
  return (
    <div class={ui.selector}>
      <div class={ui.label}>Color Palette</div>
      <div class={ui.grid}>
        <For each={defaultColorMaps}>
          {(map) => (
            <button
              class={ui.mapButton}
              classList={{
                [ui.selected as string]: props.selectedColorMapId === map.id,
              }}
              onClick={() => {
                props.onSelect(map)
              }}
              title={map.description}
            >
              <div class={ui.mapPreview}>
                <For each={map.entries}>
                  {(entry) => (
                    <div
                      class={ui.swatch}
                      style={{
                        'background-color': oklabToRgbForCss(
                          entry.a,
                          entry.b,
                          0.7,
                        ),
                      }}
                    />
                  )}
                </For>
              </div>
              <span class={ui.mapName}>{map.name}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
