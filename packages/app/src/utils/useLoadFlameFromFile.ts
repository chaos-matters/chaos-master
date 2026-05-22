import { useAlert } from '@/components/Modal/useAlert'
import { extractMetadataFromMp4 } from './flameInMp4'
import { extractFlameFromPng } from './flameInPng'
import type { SharePayload } from './jsonQueryParam'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type FlameLoadResult = {
  flame: FlameDescriptor
  animation?: SharePayload['animation']
}

export function useLoadFlameFromFile() {
  const alert = useAlert()

  async function loadFromFile(
    file: File,
  ): Promise<FlameLoadResult | undefined> {
    const arrayBuffer = await file.arrayBuffer().catch(() => undefined)
    if (!arrayBuffer) {
      await alert(`Could not load file '${file.name}'.`)
      return
    }
    const arrBuf = new Uint8Array(arrayBuffer)

    if (file.type === 'video/mp4' || file.name.endsWith('.mp4')) {
      try {
        const result = await extractMetadataFromMp4(arrayBuffer)
        if (result) return result
      } catch (_) {
        // fall through to error
      }
      await alert(`No flame metadata found in '${file.name}'.`)
      return
    }

    try {
      return await extractFlameFromPng(arrBuf)
    } catch (_) {
      await alert(`No valid flame found in '${file.name}'.`)
    }
  }

  return loadFromFile
}
