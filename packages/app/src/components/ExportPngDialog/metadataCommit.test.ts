import { describe, expect, it, vi } from 'vitest'
import { commitChangedExportMetadata } from './metadataCommit'

describe('export metadata commit', () => {
  it('routes only changed preview fields through semantic commits', () => {
    const commit = vi.fn()

    commitChangedExportMetadata(
      { name: 'Old', description: 'Same', author: 'Ada' },
      { name: 'New', description: 'Same', author: 'Grace' },
      commit,
    )

    expect(commit).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledWith({ name: 'New', author: 'Grace' })
  })

  it('does not create a history action when the preview metadata is unchanged', () => {
    const commit = vi.fn()
    const metadata = { name: 'Same', description: 'Same', author: 'Ada' }

    commitChangedExportMetadata(metadata, { ...metadata }, commit)

    expect(commit).not.toHaveBeenCalled()
  })
})
