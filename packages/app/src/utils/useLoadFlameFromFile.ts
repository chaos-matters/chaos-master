import { useAlert } from '@/components/Modal/useAlert'
import { validateExample } from '@/flame/examples/util'
import { extractFlameFromPng } from './flameInPng'

export function useLoadFlameFromFile() {
  const alert = useAlert()

  async function loadFromFile(file: File) {
    const arrayBuffer = await file.arrayBuffer().catch(() => undefined)
    if (!arrayBuffer) {
      await alert(`Could not load file '${file.name}'.`)
      return
    }
    const arrBuf = new Uint8Array(arrayBuffer)
    const extractedData: unknown = await extractFlameFromPng(arrBuf).catch(
      () => undefined,
    )
    try {
      return validateExample(extractedData)
    } catch (_) {
      await alert(`Could not validate Flame Description in '${file.name}'.`)
    }
  }

  return loadFromFile
}
