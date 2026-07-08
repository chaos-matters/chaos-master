import styles from './AudioWiringModal.module.css'

export function ConnectingBanner(props: {
  connectingSourceLabel: string | null
  draggingSourceLabel: string | null
  draggingTargetLabel: string | null
  toast: { sourceLabel: string; targetKey: string } | null
}) {
  return (
    <>
      {props.connectingSourceLabel && (
        <div class={styles.connectingBanner}>
          Click a target parameter to connect {props.connectingSourceLabel} →
        </div>
      )}
      {props.draggingSourceLabel && (
        <div class={styles.connectingBanner}>
          Release on a target to connect {props.draggingSourceLabel} →
        </div>
      )}
      {props.draggingTargetLabel && (
        <div class={styles.connectingBanner}>
          ← Release on a source to connect to {props.draggingTargetLabel}
        </div>
      )}
      {props.toast && (
        <div class={styles.replaceToast}>
          Replaced {props.toast.sourceLabel} → {props.toast.targetKey}
        </div>
      )}
    </>
  )
}
