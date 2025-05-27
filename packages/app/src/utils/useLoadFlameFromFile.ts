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
    const newFlameDescriptor = await extractFlameFromPng(arrBuf).catch(
      () => undefined,
    )
    if (!newFlameDescriptor) {
      await alert(`Could not find Flame Description in '${file.name}'.`)
      return
    }
    return newFlameDescriptor
  }

  return loadFromFile
}
