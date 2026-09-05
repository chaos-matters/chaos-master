import styles from './WorkspaceSkeleton.module.css'

export function WorkspaceSkeleton() {
  return (
    <div
      class={styles.skeletonLayout}
      role="status"
      aria-label="Loading workspace"
    >
      <aside class={styles.skeletonSidebar}>
        <div class={`${styles.shimmer} ${styles.sidebarHeader}`} />
        <div class={styles.sidebarCard}>
          <div class={`${styles.shimmer} ${styles.cardTitle}`} />
          <div class={`${styles.shimmer} ${styles.cardRow}`} />
          <div class={styles.rowGroup}>
            <div class={`${styles.shimmer} ${styles.cardRowHalf}`} />
            <div class={`${styles.shimmer} ${styles.cardRowHalf}`} />
          </div>
        </div>
        <div class={styles.sidebarCard}>
          <div class={`${styles.shimmer} ${styles.cardTitle}`} />
          <div class={`${styles.shimmer} ${styles.cardRow}`} />
          <div class={`${styles.shimmer} ${styles.cardRow}`} />
        </div>
        <div class={styles.sidebarCard}>
          <div class={`${styles.shimmer} ${styles.cardTitle}`} />
          <div class={styles.rowGroup}>
            <div class={`${styles.shimmer} ${styles.cardRowHalf}`} />
            <div class={`${styles.shimmer} ${styles.cardRowHalf}`} />
          </div>
          <div class={`${styles.shimmer} ${styles.cardRow}`} />
        </div>
      </aside>

      <main class={styles.skeletonViewport}>
        <div class={styles.viewportCenterAura} />
        <div class={styles.skeletonFloatingActions}>
          <div class={`${styles.shimmer} ${styles.actionPill}`} />
          <div class={`${styles.shimmer} ${styles.actionPill}`} />
          <div class={`${styles.shimmer} ${styles.actionPill}`} />
        </div>
      </main>

      <footer class={styles.skeletonBottomBar}>
        <div class={`${styles.shimmer} ${styles.timelineButton}`} />
        <div class={`${styles.shimmer} ${styles.timelineScrubber}`} />
        <div class={`${styles.shimmer} ${styles.actionPill}`} />
      </footer>
    </div>
  )
}
