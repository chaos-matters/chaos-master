/**
 * Is this an Apple WebKit engine (iOS/iPadOS — where every browser is WebKit —
 * or macOS Safari)?
 *
 * Used to scope WebKit-only rendering workarounds so their cost is not paid on
 * engines that don't need them.
 *
 * `vendor` is deprecated but remains the only reliable discriminator here:
 * WebKit reports 'Apple Computer, Inc.', Blink reports 'Google Inc.', Gecko
 * reports ''. User-agent sniffing cannot separate iOS Chrome — which is WebKit
 * underneath and therefore HAS the bug — from desktop Chrome, which does not.
 * Treated as a hint: a wrong answer costs a little GPU time or leaves a
 * WebKit-only artifact, never correctness.
 */
export function isAppleWebKit(): boolean {
  const nav = globalThis.navigator as Navigator | undefined
  if (nav === undefined) return false
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return nav.vendor === 'Apple Computer, Inc.'
}
