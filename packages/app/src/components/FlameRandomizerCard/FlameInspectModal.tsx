import { Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { ModalTitleBar } from '@/components/Modal/ModalTitleBar'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { Root } from '@/lib/Root'
import ui from './FlameInspectModal.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// Much larger backing store than the gallery thumbnails — this is the
// "inspect at full quality before applying" view.
const INSPECT_RESOLUTION = { width: 1280, height: 720 }

/**
 * A single flame rendered large and at high quality, opened from a gallery
 * cell's "inspect" action so the user can examine a candidate before applying.
 * Portal'd outside the app's <Root>, so it provides its own.
 */
export function FlameInspectModal(props: {
  flame: FlameDescriptor
  onApply: (flame: FlameDescriptor) => void
  respond: () => void
}) {
  const is3D = () => (props.flame.renderSettings.dimensions ?? 2) === 3
  return (
    <div class={ui.modal}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>Inspect Flame</span>
      </ModalTitleBar>

      <div class={ui.canvasWrap}>
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <AutoCanvas pixelRatio={1} fixedResolution={INSPECT_RESOLUTION}>
            <Show
              when={is3D()}
              fallback={
                <Camera2D
                  position={vec2f(...props.flame.renderSettings.camera.position)}
                  zoom={props.flame.renderSettings.camera.zoom}
                >
                  <Flam3
                    animationEnabled={false}
                    quality={0.999}
                    pointCountPerBatch={DEFAULT_POINT_COUNT}
                    persistChains={false}
                    adaptiveFilterEnabled={true}
                    flameDescriptor={props.flame}
                    renderInterval={1}
                    edgeFadeColor={vec4f(0)}
                  />
                </Camera2D>
              }
            >
              <Default3DPreviewCamera camera3D={props.flame.renderSettings.camera3D}>
                <Flam3
                  animationEnabled={false}
                  quality={0.999}
                  pointCountPerBatch={DEFAULT_POINT_COUNT}
                  persistChains={false}
                  adaptiveFilterEnabled={false}
                  flameDescriptor={props.flame}
                  renderInterval={1}
                  edgeFadeColor={vec4f(0)}
                />
              </Default3DPreviewCamera>
            </Show>
          </AutoCanvas>
        </Root>
      </div>

      <div class={ui.footer}>
        <button
          type="button"
          class={ui.applyBtn}
          onClick={() => {
            props.onApply(props.flame)
            props.respond()
          }}
        >
          Apply this flame
        </button>
      </div>
    </div>
  )
}
