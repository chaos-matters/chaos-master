import { createResource, createSignal, For, Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { autosaveIntervalMin, autosaveRecents, setAutosaveIntervalMin, setAutosaveRecents, } from '@/utils/autosaveSettings'
import { buildFlameBackupZip, downloadBackupZip } from '@/utils/flameBackup'
import { applyFlameImport, readFlameFiles, summarizeImport, } from '@/utils/flameImport'
import { formatBytes } from '@/utils/formatBytes'
import { pickFiles } from '@/utils/pickFiles'
import { clearAllFlames, clearSettings, computeStorageUsage, } from '@/utils/storageUsage'
import { Button } from '../Button/Button'
import { Checkbox } from '../Checkbox/Checkbox'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './DataManagement.module.css'
import type { BackupFormat, BackupGroups } from '@/utils/flameBackup'
import type { StorageBucket, StorageUsage } from '@/utils/storageUsage'

const FORMAT_OPTIONS: { value: BackupFormat; label: string }[] = [
  { value: 'both', label: 'JSON + PNG' },
  { value: 'json', label: 'JSON only' },
  { value: 'png', label: 'PNG only' },
]

type ConfirmLine = { label: string; count: number; bytes: number }

function ConfirmClearModal(props: {
  title: string
  intro: string
  lines: ConfirmLine[]
  confirmLabel: string
  respond: (confirmed: boolean) => void
}) {
  const total = () => props.lines.reduce((s, l) => s + l.bytes, 0)
  const items = () => props.lines.reduce((s, l) => s + l.count, 0)
  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(false)
        }}
      >
        {props.title}
      </ModalTitleBar>
      <div class={ui.confirmBody}>
        <p class={ui.confirmIntro}>{props.intro}</p>
        <div class={ui.confirmList}>
          <For each={props.lines}>
            {(line) => (
              <div class={ui.confirmRow}>
                <span>{line.label}</span>
                <span class={ui.confirmRowMeta}>
                  {line.count} {line.count === 1 ? 'item' : 'items'} ·{' '}
                  {formatBytes(line.bytes)}
                </span>
              </div>
            )}
          </For>
        </div>
        <p class={ui.confirmTotal}>
          {items()} {items() === 1 ? 'item' : 'items'} · {formatBytes(total())}{' '}
          recovered. This cannot be undone.
        </p>
        <div class={ui.confirmActions}>
          <Button
            onClick={() => {
              props.respond(false)
            }}
          >
            Cancel
          </Button>
          <Button
            class={ui.dangerBtn}
            onClick={() => {
              props.respond(true)
            }}
          >
            {props.confirmLabel}
          </Button>
        </div>
      </div>
    </>
  )
}

function UsageRow(props: { label: string; bucket: StorageBucket }) {
  return (
    <div class={ui.usageRow}>
      <span class={ui.usageLabel}>{props.label}</span>
      <span class={ui.usageMeta}>
        {props.bucket.count} {props.bucket.count === 1 ? 'item' : 'items'}
      </span>
      <span class={ui.usageBytes}>{formatBytes(props.bucket.bytes)}</span>
    </div>
  )
}

export function DataManagement() {
  const requestModal = useRequestModal()
  const { showToast } = useToast()

  const [usage, { refetch }] = createResource<StorageUsage>(computeStorageUsage)

  const [backupRecents, setBackupRecents] = createSignal(true)
  const [backupGenerated, setBackupGenerated] = createSignal(true)
  const [backupLogo, setBackupLogo] = createSignal(true)
  const [backupFormat, setBackupFormat] = createSignal<BackupFormat>('both')
  const [exporting, setExporting] = createSignal(false)
  const [importing, setImporting] = createSignal(false)

  const anyGroupSelected = () =>
    backupRecents() || backupGenerated() || backupLogo()

  const selectedGroups = (): BackupGroups => ({
    recents: backupRecents(),
    generated: backupGenerated(),
    logo: backupLogo(),
  })

  async function handleExport() {
    if (exporting() || !anyGroupSelected()) return
    setExporting(true)
    try {
      const result = await buildFlameBackupZip(selectedGroups(), backupFormat())
      const total =
        result.counts.recents + result.counts.generated + result.counts.logo
      if (total === 0) {
        showToast('Nothing to back up in the selected groups')
        return
      }
      downloadBackupZip(result.bytes)
      showToast(
        `Exported ${total} flame${total === 1 ? '' : 's'} (${formatBytes(result.bytes.length)})`,
      )
    } catch (err) {
      console.error('Backup export failed:', err)
      showToast('Backup export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleImport() {
    if (importing() || !anyGroupSelected()) return
    const [file] = await pickFiles({
      id: 'import-flame-backup',
      accept: { 'application/zip': ['.zip'] },
    })
    if (!file) return
    setImporting(true)
    try {
      const parsed = await readFlameFiles([file], selectedGroups())
      const summary = await applyFlameImport(parsed.candidates)
      summary.failed += parsed.failed
      showToast(summarizeImport(summary))
      void refetch()
    } catch (err) {
      console.error('Backup import failed:', err)
      showToast('Backup import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleClearSettings() {
    const u = usage()
    if (!u) return
    const confirmed = await requestModal<boolean>({
      content: ({ respond }) => (
        <ConfirmClearModal
          title="Clear all settings?"
          intro="This resets your preferences (theme, layout, quality and randomizer options, dismissed prompts). Your saved flames are not touched."
          lines={[{ label: 'Settings', ...u.settings }]}
          confirmLabel="Clear settings"
          respond={respond}
        />
      ),
    })
    if (!confirmed) return
    const cleared = clearSettings()
    showToast(
      `Cleared ${cleared.count} setting${cleared.count === 1 ? '' : 's'} (${formatBytes(cleared.bytes)})`,
    )
    void refetch()
  }

  async function handleClearFlames() {
    const u = usage()
    if (!u) return
    const confirmed = await requestModal<boolean>({
      content: ({ respond }) => (
        <ConfirmClearModal
          title="Delete all stored flames?"
          intro="This permanently removes every flame you have saved or generated on this device."
          lines={[
            { label: 'Recent flames', ...u.recentFlames },
            { label: 'Generated history', ...u.generatedHistory },
            { label: 'Logo/Favicon history', ...u.logoHistory },
          ]}
          confirmLabel="Delete all flames"
          respond={respond}
        />
      ),
    })
    if (!confirmed) return
    const cleared = await clearAllFlames()
    const items =
      cleared.recentFlames.count +
      cleared.generatedHistory.count +
      cleared.logoHistory.count
    showToast(`Deleted ${items} flame${items === 1 ? '' : 's'}`)
    void refetch()
  }

  return (
    <div class={ui.root}>
      {/* Storage usage breakdown */}
      <section class={ui.card}>
        <div class={ui.cardLabel}>Usage</div>
        <Show
          when={usage()}
          fallback={<div class={ui.loading}>Calculating storage…</div>}
        >
          {(u) => (
            <>
              <UsageRow label="Settings" bucket={u().settings} />
              <UsageRow label="Recent flames" bucket={u().recentFlames} />
              <UsageRow
                label="Generated history"
                bucket={u().generatedHistory}
              />
              <UsageRow label="Logo/Favicon history" bucket={u().logoHistory} />
              <div class={ui.usageTotal}>
                <span>Total</span>
                <span>{formatBytes(u().totalBytes)}</span>
              </div>
            </>
          )}
        </Show>
      </section>

      {/* Backup / export / import */}
      <section class={ui.card}>
        <div class={ui.cardLabel}>Backup &amp; Restore</div>
        <p class={ui.cardHint}>
          Bundle your flames into a ZIP — JSON descriptors and/or PNGs with the
          flame embedded (from history thumbnails). Restoring reads the same ZIP
          back into the groups ticked below.
        </p>
        <div class={ui.fieldRow}>
          <span class={ui.fieldName}>Include</span>
          <div class={ui.groupChecks}>
            <label class={ui.groupCheck}>
              <Checkbox checked={backupRecents()} onChange={setBackupRecents} />
              <span>Recent</span>
            </label>
            <label class={ui.groupCheck}>
              <Checkbox
                checked={backupGenerated()}
                onChange={setBackupGenerated}
              />
              <span>Generated</span>
            </label>
            <label class={ui.groupCheck}>
              <Checkbox checked={backupLogo()} onChange={setBackupLogo} />
              <span>Logo</span>
            </label>
          </div>
        </div>
        <div class={ui.fieldRow}>
          <span class={ui.fieldName}>Format</span>
          <div class={ui.pills}>
            <For each={FORMAT_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  class={ui.pill}
                  classList={{
                    [ui.pillActive as string]: backupFormat() === opt.value,
                  }}
                  onClick={() => setBackupFormat(opt.value)}
                >
                  {opt.label}
                </button>
              )}
            </For>
          </div>
          <span class={ui.fieldNote}>export only</span>
        </div>
        <div class={ui.actionRow}>
          <Button
            class={ui.exportBtn}
            onClick={handleExport}
            disabled={exporting() || !anyGroupSelected()}
          >
            {exporting() ? 'Exporting…' : 'Export Backup'}
            <span class={ui.zipBadge}>ZIP</span>
          </Button>
          <Button
            class={ui.exportBtn}
            onClick={handleImport}
            disabled={importing() || !anyGroupSelected()}
          >
            {importing() ? 'Importing…' : 'Import Backup'}
            <span class={ui.zipBadge}>ZIP</span>
          </Button>
        </div>
        <p class={ui.cardHint}>
          Importing never overwrites what you already have: a flame that is
          already stored is skipped, and nothing is evicted to make room.
          Generated and logo flames restore into their galleries when the ZIP
          carries their image; from a JSON-only backup they land in Recent
          flames instead.
        </p>
      </section>

      {/* Auto-save */}
      <section class={ui.card}>
        <div class={ui.cardLabel}>Auto-save</div>
        <p class={ui.cardHint}>
          Periodically saves the active flame (and its animation) into Recent
          flames while you edit — one entry per session, updated in place.
          Unsaved changes are also stored automatically when the tab closes or
          reloads, regardless of this setting.
        </p>
        <div class={ui.fieldRow}>
          <span class={ui.fieldName}>Periodic auto-save</span>
          <label class={ui.groupCheck}>
            <Checkbox
              checked={autosaveRecents() === 'on'}
              onChange={(v) => setAutosaveRecents(v ? 'on' : 'off')}
            />
            <span>Enabled</span>
          </label>
        </div>
        <div class={ui.fieldRow}>
          <span class={ui.fieldName}>Interval</span>
          <div class={ui.pills}>
            <For each={[1, 2, 5, 10]}>
              {(minutes) => (
                <button
                  type="button"
                  class={ui.pill}
                  classList={{
                    [ui.pillActive as string]:
                      autosaveIntervalMin() === minutes,
                  }}
                  onClick={() => setAutosaveIntervalMin(minutes)}
                >
                  {minutes} min
                </button>
              )}
            </For>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section class={ui.card} classList={{ [ui.dangerCard as string]: true }}>
        <div
          class={ui.cardLabel}
          classList={{ [ui.dangerLabel as string]: true }}
        >
          Danger Zone
        </div>
        <div class={ui.dangerRow}>
          <div class={ui.dangerText}>
            <span class={ui.dangerTitle}>Clear all settings</span>
            <span class={ui.dangerSub}>
              Reset preferences. Saved flames are kept.
            </span>
          </div>
          <Button class={ui.dangerBtn} onClick={handleClearSettings}>
            Clear settings
          </Button>
        </div>
        <div class={ui.dangerRow}>
          <div class={ui.dangerText}>
            <span class={ui.dangerTitle}>Delete all flames</span>
            <span class={ui.dangerSub}>
              Recent, generated and logo histories.
            </span>
          </div>
          <Button class={ui.dangerBtn} onClick={handleClearFlames}>
            Delete flames
          </Button>
        </div>
      </section>
    </div>
  )
}
