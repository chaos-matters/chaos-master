/**
 * The Capacitor adapter. Only the native build reaches this module, through
 * `if (IS_NATIVE) await import('@chaos-master/mobile-runtime/capacitor')`, so
 * the web bundle never contains the plugins.
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { saveFileWith, shareBlobWith, shareSavedWith } from '../files'
import type { FilePorts, SaveOptions, SaveOutcome, StorageArea } from '../files'

export type { SaveOptions, SaveOutcome } from '../files'

const DIRECTORY: Record<StorageArea, Directory> = {
  documents: Directory.Documents,
  cache: Directory.Cache,
}

/**
 * A plugin call that never answers (a plugin whose coroutine scope died, a
 * dropped bridge message) would otherwise leave the save pending forever,
 * with no toast and nothing in the log. The share sheet is exempt: it
 * answers when the user does.
 */
const DEADLINE_MS = 20_000

function withDeadline<T>(what: string, call: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} did not answer within ${DEADLINE_MS / 1000} s`))
    }, DEADLINE_MS)
    call.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/** The plugin's code for "nothing at this path", on both platforms. */
const DOES_NOT_EXIST = 'OS-PLUG-FILE-0008'

const codeOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined

const ports: FilePorts = {
  platform: Capacitor.getPlatform(),
  exists: (path, area) =>
    withDeadline(
      'Filesystem.stat',
      Filesystem.stat({ path, directory: DIRECTORY[area] }),
    ).then(
      () => true,
      (error: unknown) => {
        if (codeOf(error) === DOES_NOT_EXIST) return false
        throw error
      },
    ),
  write: async (path, area, data) => {
    const { uri } = await withDeadline(
      'Filesystem.writeFile',
      Filesystem.writeFile({
        path,
        data,
        directory: DIRECTORY[area],
        recursive: true,
      }),
    )
    return uri
  },
  append: (path, area, data) =>
    withDeadline(
      'Filesystem.appendFile',
      Filesystem.appendFile({ path, data, directory: DIRECTORY[area] }),
    ),
  remove: (path, area) =>
    withDeadline(
      'Filesystem.deleteFile',
      Filesystem.deleteFile({ path, directory: DIRECTORY[area] }),
    ),
  share: async (uri, title) => {
    await Share.share({ title, files: [uri], dialogTitle: title })
  },
}

/** Android: Documents/<folder>, falling back to the share sheet. iOS: the share sheet. */
export const saveFile = (
  blob: Blob,
  fileName: string,
  options: SaveOptions,
): Promise<SaveOutcome> => saveFileWith(ports, blob, fileName, options)

/** The share sheet for a blob, on both platforms: the stand-in for copying an image. */
export const shareBlob = (blob: Blob, fileName: string): Promise<SaveOutcome> =>
  shareBlobWith(ports, blob, fileName)

/** Opens the share sheet for a file `saveFile` saved. */
export const shareSavedFile = (uri: string, title: string): Promise<void> =>
  shareSavedWith(ports, uri, title)
