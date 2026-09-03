import { describe, expect, it } from 'vitest'
import { MAX_IMPORT_FILE_SIZE } from '@/utils/flameImport'
import { ACCEPTED_FORMATS, FLAME_FILE_ACCEPT, MAX_IMPORT_FILE_SIZE_LABEL, } from './LoadFlameModal'

const extensions = Object.values(FLAME_FILE_ACCEPT).flat()

describe('accepted format pills', () => {
  it('shows one pill per accepted extension', () => {
    expect(ACCEPTED_FORMATS).toHaveLength(extensions.length)
  })

  // The zone used to list formats in prose, written out separately from the
  // picker's accept map — the two could disagree with nothing to catch it.
  it('covers exactly what the file picker accepts', () => {
    for (const ext of extensions) {
      const shown = ACCEPTED_FORMATS.some(
        (f) =>
          f.label === ext || f.label.toLowerCase() === ext.replace('.', ''),
      )
      expect(shown, `no pill for ${ext}`).toBe(true)
    }
  })

  it('gives every extension a real label, never the raw fallback', () => {
    for (const format of ACCEPTED_FORMATS) {
      expect(format.hint).not.toBe(format.label)
      expect(format.hint.length).toBeGreaterThan(4)
    }
  })

  it('states the limit the importer actually enforces', () => {
    expect(MAX_IMPORT_FILE_SIZE_LABEL).toBe(
      `${Math.round(MAX_IMPORT_FILE_SIZE / (1024 * 1024))} MB`,
    )
    expect(MAX_IMPORT_FILE_SIZE_LABEL).toMatch(/^\d+ MB$/)
  })
})
