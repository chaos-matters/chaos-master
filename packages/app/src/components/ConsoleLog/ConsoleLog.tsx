import { createEffect, createSignal, For, Show } from 'solid-js'
import { clearConsoleLogs, consoleLogs } from '@/stores/console-store'
import ui from './ConsoleLog.module.css'
import type { LogType } from '@/stores/console-store'

const typeClass: Record<LogType, string> = {
  log: ui.typeLog!,
  error: ui.typeError!,
  warn: ui.typeWarn!,
  info: ui.typeInfo!,
  debug: ui.typeDebug!,
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

/* eslint-disable @typescript-eslint/no-base-to-string */
function formatArgs(args: unknown[]) {
  return args
    .map((a) => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}`
      }
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a, null, 2)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}
/* eslint-enable @typescript-eslint/no-base-to-string */

type ConsoleLogProps = {
  /** When true the section can be collapsed by tapping the header. */
  collapsible?: boolean
  /** Initial open state when collapsible. Defaults to true. */
  defaultOpen?: boolean
  /** Visual variant. Use 'crash' for the crash screen styling. */
  variant?: 'crash'
}

export function ConsoleLog(props: ConsoleLogProps) {
  let containerRef: HTMLDivElement | undefined
  const [copied, setCopied] = createSignal(false)
  const [open, setOpen] = createSignal(props.defaultOpen ?? true)

  createEffect(() => {
    const logs = consoleLogs()
    if (logs.length > 0 && containerRef && open()) {
      containerRef.scrollTop = containerRef.scrollHeight
    }
  })

  function copyLogs() {
    const text = consoleLogs()
      .map(
        (entry) =>
          `[${formatTime(entry.timestamp)}] ${entry.type.toUpperCase().padEnd(5)} ${formatArgs(entry.args)}`,
      )
      .join('\n')
    // eslint-disable-next-line no-restricted-globals
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function toggleOpen(e: MouseEvent) {
    if (!props.collapsible) return
    e.stopPropagation()
    setOpen((v) => !v)
  }

  return (
    <div classList={{ [ui.crash!]: props.variant === 'crash' }}>
      <div
        class={ui.header}
        classList={{ [ui.headerCollapsible!]: !!props.collapsible }}
        onClick={toggleOpen}
      >
        <span class={ui.headerTitle}>
          {props.collapsible && (
            <span
              class={ui.collapseIndicator}
              classList={{ [ui.collapseOpen!]: open() }}
            />
          )}
          Console ({consoleLogs().length})
        </span>
        <div class={ui.headerActions}>
          <button
            class={ui.clearBtn}
            onClick={(e) => {
              e.stopPropagation()
              copyLogs()
            }}
            disabled={consoleLogs().length === 0}
          >
            {copied() ? 'Copied!' : 'Copy'}
          </button>
          <button
            class={ui.clearBtn}
            onClick={(e) => {
              e.stopPropagation()
              clearConsoleLogs()
            }}
          >
            Clear
          </button>
        </div>
      </div>
      <Show when={open()}>
        <div ref={containerRef} class={ui.consoleLog}>
          <Show
            when={consoleLogs().length > 0}
            fallback={<div class={ui.empty}>No console output yet.</div>}
          >
            <For each={consoleLogs()}>
              {(entry) => (
                <div class={ui.entry}>
                  <span class={ui.timestamp}>
                    {formatTime(entry.timestamp)}
                  </span>
                  <span class={`${ui.type} ${typeClass[entry.type]}`}>
                    {entry.type}
                  </span>
                  <span class={ui.args}>{formatArgs(entry.args)}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}
