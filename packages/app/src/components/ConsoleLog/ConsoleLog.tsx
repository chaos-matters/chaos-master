import { createEffect, For, Show } from 'solid-js'
import { clearConsoleLogs,consoleLogs } from '@/stores/console-store'
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
  return (
    `${d.getHours().toString().padStart(2, '0') 
    }:${ 
    d.getMinutes().toString().padStart(2, '0') 
    }:${ 
    d.getSeconds().toString().padStart(2, '0')}`
  )
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

export function ConsoleLog() {
  let containerRef: HTMLDivElement | undefined

  createEffect(() => {
    const logs = consoleLogs()
    if (logs.length > 0 && containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight
    }
  })

  return (
    <div>
      <div class={ui.header}>
        <span class={ui.headerTitle}>
          Console ({consoleLogs().length})
        </span>
        <button class={ui.clearBtn} onClick={clearConsoleLogs}>
          Clear
        </button>
      </div>
      <div
        ref={containerRef}
        class={ui.consoleLog}
      >
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
    </div>
  )
}
