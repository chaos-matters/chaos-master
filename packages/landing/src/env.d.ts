/// <reference types="astro/client" />

interface Window {
  /** Google tag, defined inline by layouts/Base.astro when analytics is on. */
  gtag?: (...args: unknown[]) => void
}
