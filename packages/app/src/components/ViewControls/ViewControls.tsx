import { For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { Minus, Plus, Redo, Undo } from '@/icons'
import { Button } from '../Button/Button'
import { ButtonGroup } from '../Button/ButtonGroup'
import { SoftwareVersion } from '../SoftwareVersion/SoftwareVersion'
import { KeyframeDiamond } from '../Timeline/KeyframeDiamond'
import ui from './ViewControls.module.css'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'

type ViewControlProps = {
  pixelRatio: number
  setPixelRatio: Setter<number>
  zoom: number
  position: v2f
  setPosition: Setter<v2f>
  setZoom: Setter<number>
  controlsDisabled?: boolean
}

export function ViewControls(props: ViewControlProps) {
  const history = useChangeHistory()
  const { setTargetedParameter } = useKeyframeTarget()
  const disabled = () => props.controlsDisabled ?? false
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
        <div
          class={ui.viewControlWrapper}
          onClick={() => {
            setTargetedParameter('camera.zoom')
          }}
        >
          <Button
            disabled={disabled() || props.zoom <= 0.01}
            onClick={(e) => {
              e.stopPropagation()
              props.setZoom((p) => p * 0.9)
            }}
          >
            <Minus />
          </Button>
        </div>
        <div
          class={ui.viewControlWrapper}
          onClick={() => {
            setTargetedParameter('camera.zoom')
          }}
        >
          <Button
            disabled={disabled()}
            onClick={() => {
              props.setZoom(1)
              props.setPosition(vec2f())
            }}
            style={{ 'min-width': '4rem' }}
          >
            {(props.zoom * 100).toFixed(0)}%
          </Button>
          <KeyframeDiamond parameterPath="camera.zoom" />
        </div>
        <div
          class={ui.viewControlWrapper}
          onClick={() => {
            setTargetedParameter('camera.zoom')
          }}
        >
          <Button
            disabled={disabled()}
            onClick={() => {
              setTargetedParameter('camera.zoom')
              props.setZoom((p) => p / 0.9)
            }}
          >
            <Plus />
          </Button>
        </div>
      </ButtonGroup>
      <ButtonGroup>
        <div
          class={ui.cameraCoord}
          onClick={() => {
            setTargetedParameter('camera.x')
          }}
        >
          <span class={ui.cameraCoordLabel}>X</span>
          <span class={ui.cameraCoordValue}>{props.position.x.toFixed(2)}</span>
          <KeyframeDiamond parameterPath="camera.x" />
        </div>
        <div
          class={ui.cameraCoord}
          onClick={() => {
            setTargetedParameter('camera.y')
          }}
        >
          <span class={ui.cameraCoordLabel}>Y</span>
          <span class={ui.cameraCoordValue}>{props.position.y.toFixed(2)}</span>
          <KeyframeDiamond parameterPath="camera.y" />
        </div>
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
