/**
 * Slim stand-in for the app's editor `ErrorHandling`, aliased in over the real
 * module for the marketing build (see astro.config.mjs).
 *
 * Why: the real one imports the whole `@/icons` barrel + `ConsoleLog` + version
 * banner + a CSS module — none of which belong on a landing page — and, worse,
 * `Root` renders `<WebgpuNotSupported>` when WebGPU is unavailable, which would
 * paint an editor error screen on top of the hero. Here we render nothing, so the
 * hero poster behind the island stays visible as the non-WebGPU fallback.
 *
 * This mirrors the server-side-gpu-renderer branch's approach of mocking the
 * modules the render core doesn't actually need.
 */
export function WebgpuNotSupported() {
  return null
}

export function AppCrashed() {
  return null
}
