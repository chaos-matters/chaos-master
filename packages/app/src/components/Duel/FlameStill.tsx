import { createSignal } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { palette as makePalette } from '@/flame/colorMap'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ExportImageType } from '@/MainWorkspace'

/**
 * One flame, rendered off-screen to a still, once.
 *
 * The same recipe `ExportJobHost` uses for an image export — `exportDriver`
 * with a zero render interval drives the sampler as fast as the GPU allows
 * and reports `finalImageReady` when the quality target is met — but without
 * the export tracker, because this is a picture the app wants, not a job the
 * viewer asked for.
 *
 * 2D only, deliberately: a duel refuses 3D flames, so there is no dimension
 * to branch on.
 */
export function FlameStill(props: {
  flame: FlameDescriptor
  width: number
  height: number
  quality: number
  /** The viewer's own filters, so the still matches the seat it came from. */
  adaptiveFilter: boolean
  stochasticFilter: boolean
  /**
   * Capture whatever is on the canvas after this long. A high quality target
   * can take a while to converge, and a card that never arrives is worse
   * than one that is slightly grainy.
   */
  deadlineMs: number
  onStill: (blob: Blob) => void
}) {
  const camera = props.flame.renderSettings.camera
  const zoom = createSignal(camera.zoom)
  const position = createSignal(vec2f(camera.position[0], camera.position[1]))

  // The descriptor stores a palette without the provenance a `Palette`
  // carries, so it is rebuilt rather than cast.
  const stored = props.flame.renderSettings.palette
  const palette = stored
    ? makePalette(stored.id, stored.name, stored.entries, 'custom')
    : undefined

  let captured = false
  const startedAt = globalThis.performance.now()

  const capture = (canvas: HTMLCanvasElement) => {
    if (captured) return
    captured = true
    canvas.toBlob(
      (blob) => {
        if (blob) props.onStill(blob)
      },
      'image/png',
      1,
    )
  }

  const handleExport: ExportImageType = (canvas, info) => {
    if (captured) return
    const overdue = globalThis.performance.now() - startedAt >= props.deadlineMs
    if (info?.finalImageReady !== true && !overdue) return
    capture(canvas)
  }

  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <AutoCanvas
        fixedResolution={{ width: props.width, height: props.height }}
        alphaMode="opaque"
      >
        <WheelZoomCamera2D
          zoom={zoom}
          position={position}
          interactive={() => false}
        >
          <Flam3
            quality={props.quality}
            pointCountPerBatch={DEFAULT_POINT_COUNT}
            adaptiveFilterEnabled={props.adaptiveFilter}
            stochasticFilterEnabled={props.stochasticFilter}
            animationEnabled={false}
            exportDriver
            flameDescriptor={props.flame}
            renderInterval={0}
            edgeFadeColor={vec4f(0)}
            palette={() => palette}
            onExportImage={handleExport}
          />
        </WheelZoomCamera2D>
      </AutoCanvas>
    </Root>
  )
}
