/**
 * The explorer's display buffers: the picture on screen as packed RGBA, and
 * the previous picture, the *backdrop*, which pixels that have not finished
 * yet show reprojected. A restart promotes the display to backdrop only if
 * it was drawn, since two restarts with no frame between would otherwise
 * promote an empty buffer. A retired buffer of the right size is reused.
 */
import { arrayOf, u32 } from 'typegpu/data'
import type { TgpuRoot } from 'typegpu'
import type { GridSize } from './explorerTypes'

function createDisplayBuffer(root: TgpuRoot, pixels: number) {
  return root.createBuffer(arrayOf(u32, Math.max(1, pixels))).$usage('storage')
}

export interface Display {
  readonly buffer: ReturnType<typeof createDisplayBuffer>
  readonly size: GridSize
}

function sameSize(a: GridSize, b: GridSize) {
  return a.width === b.width && a.height === b.height
}

/** Copy the first `bytes` of a buffer back to the CPU. */
export async function readBack(
  device: GPUDevice,
  source: GPUBuffer,
  bytes: number,
): Promise<ArrayBuffer> {
  const target = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  const encoder = device.createCommandEncoder()
  encoder.copyBufferToBuffer(source, 0, target, 0, bytes)
  device.queue.submit([encoder.finish()])
  await target.mapAsync(GPUMapMode.READ)
  const data = target.getMappedRange().slice(0)
  target.unmap()
  target.destroy()
  return data
}

export function createDisplays(root: TgpuRoot) {
  let display: Display | undefined
  let backdrop: Display | undefined
  /** The display has been coloured since `begin`. */
  let drawn = false

  /** Make a display of `size` current for a new picture. */
  function begin(size: GridSize) {
    // The old backdrop, when the display replaces it and it is the right
    // size, becomes the new display.
    let spare: Display | undefined
    if (display && drawn) {
      const retired = backdrop
      backdrop = display
      display = undefined
      if (retired && sameSize(retired.size, size)) spare = retired
      else retired?.buffer.destroy()
    } else if (display && !sameSize(display.size, size)) {
      display.buffer.destroy()
      display = undefined
    }
    if (!display) {
      display = spare ?? {
        buffer: createDisplayBuffer(root, size.width * size.height),
        size,
      }
    }
    drawn = false
  }

  /** The picture on screen as RGBA bytes, for saving. */
  async function read(): Promise<
    { data: Uint8ClampedArray<ArrayBuffer>; size: GridSize } | undefined
  > {
    if (!display) return undefined
    const shown = display
    const bytes = shown.size.width * shown.size.height * 4
    const data = await readBack(root.device, root.unwrap(shown.buffer), bytes)
    return { data: new Uint8ClampedArray(data), size: shown.size }
  }

  function destroy() {
    display?.buffer.destroy()
    backdrop?.buffer.destroy()
  }

  return {
    begin,
    markDrawn: () => {
      drawn = true
    },
    drawn: () => drawn,
    display: () => display,
    backdrop: () => backdrop,
    read,
    destroy,
  }
}
