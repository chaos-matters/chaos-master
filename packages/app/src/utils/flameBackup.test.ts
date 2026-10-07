import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { buildFlameBackupZip } from './flameBackup'
import { parseFlameEnvelope } from './flameImport'
import { clearRecentFlames, upsertRecentFlame } from './recentFlames'
import type { TimelineConfig } from './timeline'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const store = new Map<string, string>()
vi.mock('@/utils/storage', () => ({
  safeGetItem: (key: string) => store.get(key) ?? null,
  safeSetItem: (key: string, value: string) => {
    store.set(key, value)
    return true
  },
  safeRemoveItem: (key: string) => {
    store.delete(key)
  },
}))

const flame = () => Object.values(examples)[0] as FlameDescriptor

const config: TimelineConfig = {
  fps: 60,
  timeScale: 2,
  startFrame: 0,
  endFrame: 300,
  loop: false,
  autoFps: false,
  loopMode: 'seamless',
}

const decoder = new TextDecoder()

afterEach(clearRecentFlames)

describe('the flame backup', () => {
  it('takes the timeline out and reads it back in', async () => {
    // The importer reads `animation.config`; writing the tracks without it
    // brought every flame home at the workspace's defaults, 30fps over 90
    // frames, however it was saved.
    upsertRecentFlame('entry', flame(), 'Animated', [], config)

    const zip = await buildFlameBackupZip(
      { recents: true, generated: false, logo: false },
      'json',
    )
    const files = unzipSync(zip.bytes)
    const name = Object.keys(files).find((path) =>
      path.startsWith('recent-flames/'),
    )
    expect(name).toBeDefined()

    const parsed: unknown = JSON.parse(decoder.decode(files[name!]))
    expect(parseFlameEnvelope(parsed)?.config).toEqual(config)
  })

  it('writes no animation for a flame that has neither', async () => {
    upsertRecentFlame('entry', flame(), 'Plain')

    const zip = await buildFlameBackupZip(
      { recents: true, generated: false, logo: false },
      'json',
    )
    const files = unzipSync(zip.bytes)
    const name = Object.keys(files).find((path) =>
      path.startsWith('recent-flames/'),
    )
    const parsed = JSON.parse(decoder.decode(files[name!])) as {
      animation?: unknown
    }
    expect(parsed.animation).toBeUndefined()
  })
})
