import { VERSION } from '@/version'
import ui from './ErrorHandling.module.css'

export function WebgpuNotSupported() {
  return (
    <div class={ui.fallback}>
      <div class={ui.content}>
        <h1 class={ui.title}>CHAOS MASTER</h1>

        <p class={ui.text}>
          Your browser or device currently cannot show <strong>WebGPU</strong>{' '}
          graphics.
        </p>

        <a
          href="https://github.com/gpuweb/gpuweb/wiki/Implementation-Status"
          target="_blank"
          rel="noopener noreferrer"
          class={ui.btn}
        >
          Check WebGPU Browser Support
        </a>

        <div class={ui.hint}>
          Try the latest Chrome, Firefox, or Safari (on supported hardware) for
          the full experience or restart browser to try again.
        </div>
      </div>
    </div>
  )
}

export function AppCrashed() {
  return (
    <div class={ui.fallback}>
      <div class={ui.content}>
        <h1 class={ui.title}>CHAOS MASTER</h1>
        <p class={ui.text}>
          Chaos Master v{VERSION} <sup>alpha</sup> crashed, see logs for more
          details.
        </p>
        <span>
          Check current issues or open a bug report at{' '}
          <a
            class={ui.githubLink}
            href="https://github.com/chaos-matters/chaos-master/issues"
            target="_blank"
          >
            GitHub.
          </a>
        </span>
      </div>
    </div>
  )
}
