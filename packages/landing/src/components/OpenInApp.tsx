import { createResource, Show } from 'solid-js'
import { encodeSharePayload } from '@/utils/jsonQueryParam'
import { APP_URL } from '../lib/flame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Hover-revealed "open this flame in the app" button. Encodes the flame into the
 * app's self-contained share link (`?flame=<encoded>`, never expires) using the
 * app's own encoder, against the APP origin. If encoding fails (e.g.
 * CompressionStream unavailable), fall back to opening the app itself so the
 * button never silently disappears.
 */
export default function OpenInApp(props: { flame: FlameDescriptor }) {
  const [url] = createResource(
    () => props.flame,
    async (flame) => {
      try {
        return `${APP_URL}/?flame=${await encodeSharePayload(flame)}`
      } catch {
        return APP_URL
      }
    },
  )

  return (
    <Show when={url()}>
      <a
        class="open-in-app"
        href={url()}
        target="_blank"
        rel="noopener"
        title="Open this flame in Chaos Master"
        aria-label="Open this flame in Chaos Master"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M21 13.5V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4.5" />
        </svg>
      </a>
    </Show>
  )
}
