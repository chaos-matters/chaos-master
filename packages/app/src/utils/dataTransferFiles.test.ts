import { describe, expect, it } from 'vitest'
import { filesFromDataTransfer } from './dataTransferFiles'

function fileList(files: File[]): FileList {
  return {
    length: files.length,
    item: (i: number) => files[i] ?? null,
  } as unknown as FileList
}

describe('filesFromDataTransfer', () => {
  it('returns the files list when the browser filled it', () => {
    const file = new File(['x'], 'a.png')
    const dt = { files: fileList([file]), items: [] } as unknown as DataTransfer
    expect(filesFromDataTransfer(dt)).toEqual([file])
  })

  it('falls back to file items when files is empty', () => {
    // Some Chromium builds on Linux hand over a file-manager drop with an
    // empty `files` list while `items` still carries the entries.
    const file = new File(['x'], 'a.png')
    const dt = {
      files: fileList([]),
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => file },
      ],
    } as unknown as DataTransfer
    expect(filesFromDataTransfer(dt)).toEqual([file])
  })

  it('is empty for a missing transfer or a drop with no files at all', () => {
    expect(filesFromDataTransfer(null)).toEqual([])
    const dt = {
      files: fileList([]),
      items: [{ kind: 'string', getAsFile: () => null }],
    } as unknown as DataTransfer
    expect(filesFromDataTransfer(dt)).toEqual([])
  })
})
