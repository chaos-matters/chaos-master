/** The File System Access API types both halves of its `accept` map. */
export type AcceptMap = Record<`${string}/${string}`, `.${string}`[]>

type PickFilesOptions = {
  /** Stable picker id — browsers reopen the directory last used under it. */
  id: string
  /** MIME type -> extensions, as the File System Access API expects them. */
  accept: AcceptMap
  multiple?: boolean
}

/** `accept` attribute for the input fallback: every MIME type and extension. */
function acceptAttribute(accept: AcceptMap): string {
  return Object.entries(accept)
    .flatMap(([mime, extensions]) => [mime, ...extensions])
    .join(',')
}

/**
 * Open a file picker and resolve with what the user chose (empty when they
 * cancelled). Uses the File System Access API where available — it remembers
 * the last directory per `id` — and falls back to a hidden `<input type=file>`
 * on Firefox and Safari/iOS.
 */
export async function pickFiles(options: PickFilesOptions): Promise<File[]> {
  try {
    if ('showOpenFilePicker' in window) {
      const fileHandles = await window
        .showOpenFilePicker({
          id: options.id,
          multiple: options.multiple ?? false,
          types: [{ accept: options.accept }],
        })
        .catch(() => undefined)
      if (!fileHandles) return []
      return await Promise.all(fileHandles.map((handle) => handle.getFile()))
    }
  } catch (_) {
    // fall through to the input-based picker on any failure
  }

  return await new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = acceptAttribute(options.accept)
    input.multiple = options.multiple ?? false
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.width = '1px'
    input.style.height = '1px'
    input.addEventListener('change', () => {
      resolve([...(input.files ?? [])])
      input.remove()
    })
    input.addEventListener('cancel', () => {
      resolve([])
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}
