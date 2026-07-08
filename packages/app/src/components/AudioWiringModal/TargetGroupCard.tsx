import { Show } from 'solid-js'
import type { JSX } from 'solid-js'
import type { TargetGroupData } from './TargetNode'
import styles from './AudioWiringModal.module.css'

export function TargetGroupCard(props: {
  group: TargetGroupData
  isOpen: boolean
  groupConnCount: number
  hasCopiedData: boolean
  pendingPasteTransformIdx: number | null
  confirmPasteMode: boolean
  onToggle: () => void
  onCopy: () => void
  onPaste: () => void
  children: JSX.Element
}) {
  const isTransform = props.group.kind.startsWith('tx-')

  return (
    <div class={styles.targetGroup}>
      <div class={styles.targetGroupHeader} onClick={props.onToggle}>
        <span
          class={styles.targetGroupArrow}
          classList={{
            [styles.targetGroupArrowOpen as string]: props.isOpen,
          }}
        >
          ▶
        </span>
        <span class={styles.targetGroupTitle}>
          {props.group.label}
          {props.groupConnCount > 0 && (
            <span class={styles.groupConnCount}>{props.groupConnCount}</span>
          )}
        </span>
        {isTransform && (
          <>
            <button
              type="button"
              class={styles.copyBtn}
              onClick={(e) => {
                e.stopPropagation()
                props.onCopy()
              }}
              title="Copy wiring from this transform"
            >
              Copy
            </button>
            <Show when={props.hasCopiedData}>
              <button
                type="button"
                class={styles.pasteBtn}
                classList={{
                  [styles.pasteBtnConfirm as string]: props.confirmPasteMode,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  props.onPaste()
                }}
                title={
                  props.confirmPasteMode
                    ? 'Click again to overwrite existing connections'
                    : 'Paste wiring to this transform'
                }
              >
                {props.confirmPasteMode ? 'Confirm Paste' : 'Paste'}
              </button>
            </Show>
          </>
        )}
      </div>
      <Show when={props.isOpen}>
        <div class={styles.targetGroupContent}>{props.children}</div>
      </Show>
    </div>
  )
}
