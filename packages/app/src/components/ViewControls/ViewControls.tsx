import { For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { Cross, Minus, Plus, Redo, Undo } from '@/icons'
import { Button } from '../Button/Button'
import { ButtonGroup } from '../Button/ButtonGroup'
import { PullUpMenu } from '../PullUpMenu/PullUpMenu'
import { ScrubInput } from '../Sliders/ScrubInput'
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
  onMorphFlame: () => void
  onBreedFlame: () => void
  onEvolveFlame: () => void
  onSimulatorFlame: () => void
  onDiffFlame: () => void
  onAncestryFlame: () => void
  onGalleryFlame: () => void
  onClearBlendFlame: () => void
  onBlendWeightChange: (weight: number) => void
  is3D?: boolean
  theta?: number
  phi?: number
  radius?: number
  fov?: number
  setTheta?: Setter<number>
  setPhi?: Setter<number>
  setRadius?: Setter<number>
  setFov?: Setter<number>
  flyMode?: boolean
  flySpeed?: number
  setFlySpeed?: Setter<number>
  /** Loaded flame's name, for the always-visible status badge. */
  flameName?: string
  /** Cross-system undo router (flame history + timeline). When provided the
   *  buttons match Ctrl+Z exactly; otherwise they fall back to the flame
   *  change-history context alone. */
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: () => boolean
  canRedo?: () => boolean
  onAudioReactive?: () => void
  onSonification?: () => void
}

export function ViewControls(props: ViewControlProps) {
  const history = useChangeHistory()
  const { setTargetedParameter } = useKeyframeTarget()
  const timeline = useTimeline()
  const disabled = () => props.controlsDisabled ?? false

  const badgeName = () => props.flameName?.trim() || 'Untitled'
  const hasAnimation = () => (timeline?.tracks().length ?? 0) > 0
  // Whether the canvas currently reflects a specific animation frame (playing,
  // scrubbing, or a held parked frame) vs the base flame.
  const showingFrame = () => timeline?.isDrivingView() ?? false
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
      <Show when={!props.is3D}>
        {/* Each button targets camera.zoom for keyframing in addition to its
            zoom action, so the targeting is keyboard-operable (the wrappers are
            presentational layout only). */}
        <ButtonGroup data-tour-target="zoom-controls">
          <div class={ui.viewControlWrapper}>
            <Button
              aria-label="Zoom out"
              disabled={disabled() || props.zoom <= 0.01}
              onClick={() => {
                setTargetedParameter('camera.zoom')
                props.setZoom((p) => p * 0.9)
              }}
            >
              <Minus />
            </Button>
          </div>
          <div class={ui.viewControlWrapper}>
            <Button
              disabled={disabled()}
              onClick={() => {
                setTargetedParameter('camera.zoom')
                props.setZoom(1)
                props.setPosition(vec2f())
              }}
              style={{ 'min-width': '4rem' }}
            >
              {(props.zoom * 100).toFixed(0)}%
            </Button>
            <KeyframeDiamond parameterPath="camera.zoom" />
          </div>
          <div class={ui.viewControlWrapper}>
            <Button
              aria-label="Zoom in"
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
          <div class={ui.cameraCoord}>
            <button
              type="button"
              class={ui.cameraCoordTarget}
              aria-label="Target camera X position for keyframing"
              onClick={() => {
                setTargetedParameter('camera.x')
              }}
            >
              <span class={ui.cameraCoordLabel}>X</span>
              <span class={ui.cameraCoordValue}>
                {props.position.x.toFixed(2)}
              </span>
            </button>
            <KeyframeDiamond parameterPath="camera.x" />
          </div>
          <div class={ui.cameraCoord}>
            <button
              type="button"
              class={ui.cameraCoordTarget}
              aria-label="Target camera Y position for keyframing"
              onClick={() => {
                setTargetedParameter('camera.y')
              }}
            >
              <span class={ui.cameraCoordLabel}>Y</span>
              <span class={ui.cameraCoordValue}>
                {props.position.y.toFixed(2)}
              </span>
            </button>
            <KeyframeDiamond parameterPath="camera.y" />
          </div>
        </ButtonGroup>
      </Show>
      <Show when={props.is3D}>
        <ButtonGroup data-tour-target="camera3D-controls">
          <div class={ui.camera3DControl}>
            <ScrubInput
              label="θ"
              // Display azimuth wrapped to 0–360° (the stored theta stays
              // continuous/unbounded so orbit animations don't jump at the wrap).
              value={
                ((Math.round(((props.theta ?? 0) * 180) / Math.PI) % 360) +
                  360) %
                360
              }
              step={1}
              onInput={(v) => props.setTheta?.((v * Math.PI) / 180)}
              dataParameterPath="camera3D.theta"
            />
          </div>
          <div class={ui.camera3DControl}>
            <ScrubInput
              label="φ"
              value={Math.round(((props.phi ?? 0) * 180) / Math.PI)}
              step={1}
              onInput={(v) => props.setPhi?.((v * Math.PI) / 180)}
              dataParameterPath="camera3D.phi"
            />
          </div>
          <div class={ui.camera3DControl}>
            <ScrubInput
              label="R"
              value={props.radius ?? 5}
              min={0.1}
              max={100}
              step={0.1}
              onInput={(v) => props.setRadius?.(v)}
              dataParameterPath="camera3D.radius"
            />
          </div>
          <div class={ui.camera3DControl}>
            <ScrubInput
              label="FOV"
              value={props.fov ?? 60}
              min={1}
              max={179}
              step={1}
              onInput={(v) => props.setFov?.(v)}
              dataParameterPath="camera3D.fov"
            />
          </div>
          <Show when={props.flyMode}>
            <div
              class={ui.camera3DControl}
              title="Fly movement speed (scroll while flying to change)"
            >
              <ScrubInput
                label="Speed"
                value={props.flySpeed ?? 1}
                min={0.05}
                max={20}
                step={0.05}
                onInput={(v) => props.setFlySpeed?.(v)}
              />
            </div>
          </Show>
        </ButtonGroup>
      </Show>
      <ButtonGroup data-tour-target="undoRedo-controls">
        <Button
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!(props.canUndo?.() ?? history.hasUndo())}
          onClick={() => {
            ;(props.onUndo ?? history.undo)()
          }}
        >
          <Undo />
        </Button>
        <Button
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!(props.canRedo?.() ?? history.hasRedo())}
          onClick={() => {
            ;(props.onRedo ?? history.redo)()
          }}
        >
          <Redo />
        </Button>
      </ButtonGroup>
      <Show when={!props.is3D}>
        <Show when={props.blendFlame}>
          <div class={`${ui.blendControls} ${ui.blendControlsActive}`}>
            <Button
              active
              onClick={props.onPickBlendFlame}
              title="Change blend flame"
              data-tour-target="blend-picker"
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
              aria-label="Remove blend flame"
              onClick={props.onClearBlendFlame}
              title="Remove blend flame"
              data-tour-target="blend-clear"
            >
              <Cross width="1rem" />
            </button>
          </div>
        </Show>
        <Show when={!props.blendFlame}>
          <Button
            onClick={props.onPickBlendFlame}
            title="Pick blend flame"
            data-tour-target="blend-picker"
          >
            Blend...
          </Button>
        </Show>
        <Button
          onClick={props.onMorphFlame}
          title="Morph: animate this flame into another (animated blend)"
          data-tour-target="morph-picker"
        >
          Morph...
        </Button>
      </Show>
      {/* Everything below is dimension-agnostic and must NOT be hidden in 3D.
          It used to sit inside the `!is3D` block above, which was only ever
          about Blend and Morph — those interpolate through the blend pipeline,
          and `ifsPipeline3D.update()` takes a single flame, so there is no 3D
          blend path. Sweeping the rest under the same guard silently removed
          Audio Reactive, Sonification, Breed, Evolve, Simulator, Ancestry, Diff
          and the Gallery from every 3D flame — none of which have anything to
          do with dimensions. Breeding in particular works in 3D: `breedFlames`
          carries `variations3D` and dispatches on `isVariationType3D`. */}
      {/* Grouped feature launchers — pull-up menus keep the toolbar compact
          (10 loose buttons condensed to two groups + the direct trio). */}
      <PullUpMenu
        label="Audio"
        title="Audio features — reactive mappings and sonification"
        items={[
          {
            label: 'Audio Reactive…',
            title: 'Make the flame dance to music (audio-reactive)',
            onClick: () => props.onAudioReactive?.(),
          },
          {
            label: 'Sonification…',
            title:
              'Hear the fractal — flame structure generates real-time audio',
            onClick: () => props.onSonification?.(),
          },
        ]}
      />
      <PullUpMenu
        label="Genetics"
        title="Breeding features — crossover, evolution, lineage"
        data-tour-target="genetics-menu"
        items={[
          {
            label: 'Breed…',
            title: 'Breed: combine two flames to create new hybrid flames',
            onClick: props.onBreedFlame,
          },
          {
            label: 'Evolve…',
            title:
              'Evolution Chamber: breed across generations to evolve flames',
            onClick: props.onEvolveFlame,
          },
          {
            label: 'Simulator…',
            title:
              'Population Simulator: autonomous genetic algorithm with fitness scoring',
            onClick: props.onSimulatorFlame,
          },
          {
            label: 'Ancestry…',
            title: 'Ancestry Tree: explore the lineage of bred flames',
            onClick: props.onAncestryFlame,
          },
          {
            label: 'Diff…',
            title: 'Diff: compare two flames side by side to see what changed',
            onClick: props.onDiffFlame,
          },
        ]}
      />
      <Button
        onClick={props.onGalleryFlame}
        title="Flame Gallery: curated collection of classic flame fractals"
        data-tour-target="gallery-picker"
      >
        Gallery…
      </Button>
      {/* Always-visible status badge: flame name + dimension + animation/frame. */}
      <div class={ui.flameBadge}>
        <span class={ui.flameBadgeName} title={badgeName()}>
          {badgeName()}
        </span>
        <span class={ui.flameBadgeTag}>{props.is3D ? '3D' : '2D'}</span>
        <Show when={hasAnimation()}>
          <span
            class={ui.flameBadgeTag}
            classList={{ [ui.flameBadgeTagActive as string]: showingFrame() }}
            title={
              showingFrame()
                ? 'Showing this animation frame'
                : 'Animated flame — showing the base view (scrub/play to preview a frame)'
            }
          >
            {showingFrame()
              ? `Frame ${timeline!.currentFrame()}/${timeline!.config().endFrame}`
              : 'Base'}
          </span>
        </Show>
        <Show when={props.blendFlame}>
          <span
            class={ui.flameBadgeTag}
            classList={{ [ui.flameBadgeBlendActive as string]: true }}
            title={`Blending with ${props.blendFlame?.metadata?.name || 'Untitled'} — loaded flame looks different from preview`}
          >
            Blended: {(props.blendWeight * 100).toFixed(0)}%
          </span>
        </Show>
      </div>
    </div>
  )
}
