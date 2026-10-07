import { saveNative } from '@/lib/nativeSave'
import { IS_NATIVE } from '@/lib/platform'

/**
 * Read a Blob as a base64 string with the `data:…;base64,` prefix stripped.
 * Used by the share endpoints (OG preview upload, Discord share) which send the
 * raw base64 in a JSON body.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the `data:image/png;base64,` prefix
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => {
      reject(new Error('Failed to read blob'))
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Save a Blob under the given filename: a browser download on the web. The
 * native app's WebView ignores `<a download>`, so there it goes to shared
 * storage or the share sheet instead (lib/nativeSave). Every user-facing
 * download and export goes through here.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (IS_NATIVE) {
    void saveNative(blob, filename)
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking in the same task can cancel a download before the browser has
  // read the blob; a few seconds later costs nothing.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 5000)
}
