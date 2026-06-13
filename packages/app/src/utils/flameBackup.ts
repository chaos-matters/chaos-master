import { zipSync } from 'fflate'
import { VERSION } from '@/version'
import { addFlameDataToPng } from './flameInPng'
import { compressJsonQueryParam } from './jsonQueryParam'
import { loadHistoryEntries } from './logoHistoryDB'
import { loadRandomizerHistoryEntries } from './randomizerHistoryDB'
import { loadRecentFlames } from './recentFlames'
import type { Zippable } from 'fflate'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const ALL = 1_000_000

export type BackupGroups = {
  recents: boolean
  generated: boolean
  logo: boolean
}

export type BackupResult = {
  bytes: Uint8Array
  fileCount: number
  counts: { recents: number; generated: number; logo: number }
}

const encoder = new TextEncoder()

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2))
}

/** Decode a `data:...;base64,xxxx` URL into raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return null
  try {
    const bin = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function fileStem(name: string | undefined, index: number): string {
  const base = (name ?? 'flame')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
  return `${String(index + 1).padStart(4, '0')}-${base || 'flame'}`
}

/** Embed the flame descriptor into a stored thumbnail PNG so the image alone
 *  can be loaded straight back into the app (same zTXt chunk as share/OG). */
async function embedFlameInThumbnail(
  flame: FlameDescriptor,
  thumbnailDataUrl: string,
): Promise<Uint8Array | null> {
  const png = dataUrlToBytes(thumbnailDataUrl)
  if (png === null) return null
  const encoded = await compressJsonQueryParam(flame)
  const blob = addFlameDataToPng(encoded, png)
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Build a backup ZIP of the user's stored flames. Every flame is written as a
 * `.json` descriptor (always reloadable); generated/logo history entries also
 * get a `.png` with the flame embedded, rendered from their stored thumbnail.
 * (Fresh high-resolution batch renders are a future enhancement — for now you
 * can load any flame and re-export it at full quality.)
 */
export async function buildFlameBackupZip(
  groups: BackupGroups,
): Promise<BackupResult> {
  const files: Zippable = {}
  const counts = { recents: 0, generated: 0, logo: 0 }

  if (groups.recents) {
    const recents = loadRecentFlames()
    counts.recents = recents.length
    recents.forEach((r, i) => {
      const payload: Record<string, unknown> = {
        name: r.name,
        savedAt: r.savedAt,
        flame: r.flame,
      }
      if (r.tracks && r.tracks.length > 0)
        payload.animation = { tracks: r.tracks }
      files[`recent-flames/${fileStem(r.name, i)}.json`] = [
        jsonBytes(payload),
        { level: 6 },
      ]
    })
  }

  if (groups.generated) {
    const gen = await loadRandomizerHistoryEntries(ALL)
    counts.generated = gen.length
    for (let i = 0; i < gen.length; i++) {
      const e = gen[i]!
      const stem = fileStem(e.flame.metadata?.name ?? 'generated', i)
      files[`generated/${stem}.json`] = [jsonBytes(e.flame), { level: 6 }]
      const png = await embedFlameInThumbnail(e.flame, e.thumbnail)
      if (png !== null) files[`generated/${stem}.png`] = [png, { level: 0 }]
    }
  }

  if (groups.logo) {
    const logo = await loadHistoryEntries(ALL)
    counts.logo = logo.length
    for (let i = 0; i < logo.length; i++) {
      const e = logo[i]!
      const stem = fileStem(e.flame.metadata?.name ?? 'logo', i)
      files[`logo/${stem}.json`] = [jsonBytes(e.flame), { level: 6 }]
      const png = await embedFlameInThumbnail(e.flame, e.thumbnail)
      if (png !== null) files[`logo/${stem}.png`] = [png, { level: 0 }]
    }
  }

  files['manifest.json'] = [
    jsonBytes({
      app: 'Chaos Master',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      counts,
    }),
    { level: 6 },
  ]

  const bytes = zipSync(files)
  return { bytes, fileCount: Object.keys(files).length, counts }
}

/** Trigger a browser download of the backup ZIP. */
export function downloadBackupZip(bytes: Uint8Array, filename?: string): void {
  const name =
    filename ??
    `chaos-master-backup-${new Date().toISOString().slice(0, 10)}.zip`
  // Copy into a fresh ArrayBuffer-backed view so the Blob types cleanly.
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 5000)
}
