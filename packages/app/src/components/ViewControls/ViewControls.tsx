import { For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { Cross, Minus, Plus, Redo, Undo } from '@/icons'
import { Button } from '../Button/Button'
import { ButtonGroup } from '../Button/ButtonGroup'
import { Slider } from '../Sliders/Slider'
import { KeyframeDiamond } from '../Timeline/KeyframeDiamond'
import ui from './ViewControls.module.css'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

type ViewControlProps = {
  pixelRatio: number
  setPixelRatio: Setter<number>
  zoom: number
  position: v2f
  setPosition: Setter<v2f>
  setZoom: Setter<number>
  controlsDisabled?: boolean
  blendFlame?: FlameDescriptor
  blendWeight: number
  onPickBlendFlame: () => void
  onClearBlendFlame: () => void
  onBlendWeightChange: (weight: number) => void
}

export function ViewControls(props: ViewControlProps) {
  const history = useChangeHistory()
  const { setTargetedParameter } = useKeyframeTarget()
  const disabled = () => props.controlsDisabled ?? false
  return (
    <div class={ui.viewControls}>
      <ButtonGroup data-tour-target="pixelRatio-buttons">
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
      <ButtonGroup data-tour-target="zoom-controls">
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
      <ButtonGroup data-tour-target="camera-coordinates">
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
      <ButtonGroup data-tour-target="undoRedo-controls">
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
      <Show when={props.blendFlame}>
        <div class={ui.blendControls}>
          <Button
            active
            onClick={props.onPickBlendFlame}
            title="Change blend flame"
          >
            Blend
          </Button>
          <div class={ui.blendWeightWrap}>
            <Slider
              variant="compact"
              value={props.blendWeight}
              min={0}
              max={1}
              step={0.01}
              onInput={props.onBlendWeightChange}
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
              dataParameterPath="blendWeight"
              trackFill
              data-tour-target="blendWeight-slider"
            />
          </div>
          <button
            class={ui.blendClearBtn}
            onClick={props.onClearBlendFlame}
            title="Remove blend flame"
          >
            <Cross width="1rem" />
          </button>
        </div>
      </Show>
      <Show when={!props.blendFlame}>
        <Button onClick={props.onPickBlendFlame} title="Pick blend flame">
          Blend...
        </Button>
      </Show>
    </div>
  )
}
