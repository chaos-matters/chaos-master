import { For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { Minus, Plus, Redo, Undo } from '@/icons'
import { Button } from '../Button/Button'
import { ButtonGroup } from '../Button/ButtonGroup'
import { SoftwareVersion } from '../SoftwareVersion/SoftwareVersion'
import ui from './ViewControls.module.css'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'

type ViewControlProps = {
  pixelRatio: number
  setPixelRatio: Setter<number>
  zoom: number
  setPosition: Setter<v2f>
  setZoom: Setter<number>
}

export function ViewControls(props: ViewControlProps) {
  const history = useChangeHistory()
  return (
    <div class={ui.viewControls}>
      <ButtonGroup>
        <For each={[1, 2, 4]}>
          {(divider) => {
            const pixelRatio_ = 1 / divider
            return (
              <Button
                active={props.pixelRatio === pixelRatio_}
                onClick={() => {
                  props.setPixelRatio(pixelRatio_)
                }}
                style={{ 'min-width': '3rem' }}
              >
                <Show when={divider !== 1} fallback={'Full'}>
                  <span>
                    <sup>1</sup>/<sub>{divider}</sub>
                  </span>
                </Show>
              </Button>
            )
          }}
        </For>
      </ButtonGroup>
      <ButtonGroup>
        <Button
          disabled={props.zoom <= 0.01}
          onClick={() => {
            props.setZoom((p) => p * 0.9)
          }}
        >
          <Minus />
        </Button>
        <Button
          onClick={() => {
            props.setZoom(1)
            props.setPosition(vec2f())
          }}
          style={{ 'min-width': '4rem' }}
        >
          {(props.zoom * 100).toFixed(0)}%
        </Button>
        <Button
          onClick={() => {
            props.setZoom((p) => p / 0.9)
          }}
        >
          <Plus />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button
          disabled={!history.hasUndo()}
          onClick={() => {
            history.undo()
          }}
        >
          <Undo />
        </Button>
        <Button
          disabled={!history.hasRedo()}
          onClick={() => {
            history.redo()
          }}
        >
          <Redo />
        </Button>
      </ButtonGroup>
      <SoftwareVersion />
    </div>
  )
}
