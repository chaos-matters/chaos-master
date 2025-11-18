import { addFlameDataToPng } from '@/utils/flameInPng'
import { compressJsonQueryParam } from '@/utils/jsonQueryParam'

const { navigator } = globalThis

export function downloadDataUrlIOSSafe(filename, dataUrl) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename

  // iOS Safari requires opening in a new tab
  if (
    navigator.userAgent.includes('Safari') &&
    !navigator.userAgent.includes('Chrome')
  ) {
    const newTab = window.open(dataUrl, '_blank')
    if (!newTab) alert('Enable popups to download images.')
    return
  }

  link.click()
}
export function exportPngIOS(
  canvas: HTMLCanvasElement,
  flame: FlameDescriptor,
) {
  console.info('IOS export is running')
  // 1. Convert canvas to PNG data URL
  const dataUrl = canvas.toDataURL('image/png')

  // 2. Decode data URL into bytes
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const pngBytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    pngBytes[i] = binary.charCodeAt(i)
  }

  console.info('decoded values')
  // 3. Modify PNG by inserting metadata
  compressJsonQueryParam(flame)
    .then((encodedFlames) => {
      const modifiedBytes = addFlameDataToPng(encodedFlames, pngBytes)

      // 4. Create blob manually
      const blob = new Blob([modifiedBytes], { type: 'image/png' })
      const url = URL.createObjectURL(blob)

      // 5. iOS-safe download
      downloadIOSSafe(url, 'flame.png')
    })
    .catch(console.error)
}

export function isIOS() {
  console.info('IOS check is running')
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
