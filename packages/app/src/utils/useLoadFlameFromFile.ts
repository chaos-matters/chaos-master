import { useAlert } from '@/components/Modal/useAlert'
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
    try {
      return await extractFlameFromPng(arrBuf)
    } catch (_) {
      await alert(`No valid flame found in '${file.name}'.`)
    }
  }

  return loadFromFile
}
