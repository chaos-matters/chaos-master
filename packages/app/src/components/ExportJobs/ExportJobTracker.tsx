import { createMemo, createSignal, For, Show } from 'solid-js'
import { dismissJob, exportJobs, markJobDownloaded, requestJobForceExport, } from '@/utils/exportJobs'
import { formatEta } from '@/utils/formatEta'
import { formatPointCount } from '@/utils/formatPointCount'
import { ExportActions } from './ExportActions'
import ui from './ExportJobTracker.module.css'
import type { ExportJob } from '@/utils/exportJobs'

/**
 * Top-right popup tracking background export jobs (see utils/exportJobs.ts +
 * ExportJobHost). Shows live progress + Stop/Cancel while rendering, and a
 * thumbnail + Download once a job finishes.
 */
export function ExportJobTracker() {
  const [collapsed, setCollapsed] = createSignal(false)
  const jobs = exportJobs

  return (
    <Show when={jobs().length > 0}>
      <div class={ui.tracker}>
        <button
          type="button"
          class={ui.headerBar}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed() ? 'Expand' : 'Collapse'}
        >
          <span class={ui.headerTitle}>Exports</span>
          <span class={ui.headerCount}>{jobs().length}</span>
          <span
            class={ui.chevron}
            classList={{ [ui.chevronUp as string]: collapsed() }}
          >
            ▾
          </span>
        </button>
        <Show when={!collapsed()}>
          <div class={ui.list}>
            <For each={jobs()}>{(job) => <JobCard job={job} />}</For>
          </div>
        </Show>
      </div>
    </Show>
  )
}

function JobCard(props: { job: ExportJob }) {
  const job = props.job

  const pct = createMemo(() => {
    if (job.status === 'done') return 100
    const target = job.progress.target
    if (target <= 0) return 0
    return Math.min(99.5, Math.max(0, (job.progress.current / target) * 100))
  })

  const eta = createMemo(() => {
    if (job.status !== 'rendering') return ''
    const elapsed = (globalThis.performance.now() - job.startedAt) / 1000
    const speed = elapsed > 0 ? job.progress.current / elapsed : 0
    const remaining = job.progress.target - job.progress.current
    if (speed <= 0 || remaining <= 0) return ''
    return formatEta(remaining / speed)
  })

  const fileName = () => `${job.name?.trim() || 'flame'}.png`

  return (
    <div class={ui.card}>
      <div class={ui.cardHeader}>
        <span class={ui.cardName} title={job.name || 'Untitled'}>
          {job.name || 'Untitled'}
        </span>
        <button
          type="button"
          class={ui.dismiss}
          onClick={() => {
            dismissJob(job.id)
          }}
          title={job.status === 'rendering' ? 'Cancel and discard' : 'Dismiss'}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <Show when={job.status === 'queued'}>
        <span class={ui.muted}>Queued…</span>
      </Show>

      <Show when={job.status === 'rendering'}>
        <div class={ui.stats}>
          <span>
            {formatPointCount(job.progress.current)} /{' '}
            {formatPointCount(job.progress.target)} pts
          </span>
          <span>{pct().toFixed(0)}%</span>
        </div>
        <div class={ui.track}>
          <div class={ui.fill} style={{ width: `${pct()}%` }} />
        </div>
        <div class={ui.footer}>
          <span class={ui.eta}>{eta()}</span>
          <ExportActions
            onStop={() => {
              requestJobForceExport(job.id)
            }}
            stopLabel="Stop & Export"
            stopTitle="Stop rendering and export at the current quality"
            onCancel={() => {
              dismissJob(job.id)
            }}
            cancelTitle="Cancel and discard this export"
          />
        </div>
      </Show>

      <Show when={job.status === 'done' && job.result} keyed>
        {(result) => (
          <div class={ui.doneRow}>
            <img class={ui.thumb} src={result.blobUrl} alt={job.name} />
            <div class={ui.doneInfo}>
              <span class={ui.muted}>
                {result.width} &times; {result.height} px
              </span>
              <a
                class={ui.download}
                href={result.blobUrl}
                download={fileName()}
                onClick={() => {
                  markJobDownloaded(job.id)
                }}
              >
                Download
              </a>
            </div>
          </div>
        )}
      </Show>

      <Show when={job.status === 'error'}>
        <span class={ui.error}>{job.error ?? 'Export failed'}</span>
      </Show>
    </div>
  )
}
