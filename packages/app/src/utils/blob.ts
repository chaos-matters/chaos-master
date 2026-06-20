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

/** Trigger a browser download of a Blob under the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
