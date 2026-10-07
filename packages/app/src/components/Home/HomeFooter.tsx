import ui from './HomeTab.module.css'

/**
 * Home's links out to the project's own pages, each in a new tab like every
 * other way out of the app.
 *
 * Home sits over the editor, so leaving this tab is a pagehide, and the
 * flush that runs on it may force past a full Recents and drop the oldest
 * kept flame without asking.
 */
export function HomeFooter() {
  return (
    <footer class={ui.footer}>
      <a
        href="https://about.lumenapeiron.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        About
      </a>
      <a href="/discord" target="_blank" rel="noopener noreferrer">
        Discord
      </a>
      <a
        href="https://github.com/chaos-matters/chaos-master"
        target="_blank"
        rel="noopener noreferrer"
      >
        Source
      </a>
    </footer>
  )
}
