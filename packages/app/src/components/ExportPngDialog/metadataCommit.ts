import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type ExportMetadataField = 'name' | 'description' | 'author'
export type ExportMetadataPatch = Partial<Record<ExportMetadataField, string>>

/**
 * Persist only metadata the export dialog actually changed. The dialog edits a
 * private preview store; the callback is semantic so MainWorkspace can route
 * the complete Export gesture through one recorder command/history entry.
 */
export function commitChangedExportMetadata(
  current: FlameDescriptor['metadata'],
  next: FlameDescriptor['metadata'],
  commit: (patch: ExportMetadataPatch) => void,
): void {
  const values: Record<ExportMetadataField, string> = {
    name: next?.name ?? '',
    description: next?.description ?? '',
    author: next?.author ?? 'unknown',
  }
  const patch: ExportMetadataPatch = {}
  for (const field of ['name', 'description', 'author'] as const) {
    if ((current?.[field] ?? '') !== values[field]) {
      patch[field] = values[field]
    }
  }
  if (Object.keys(patch).length > 0) commit(patch)
}
