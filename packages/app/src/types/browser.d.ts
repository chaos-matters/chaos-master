// Ambient augmentations for non-standard browser APIs the app reads defensively
// (all optional — guarded at every call site). Declaring them here replaces
// scattered `(x as any).field` casts with typed, optional access.

interface Navigator {
  /** Device Memory API (Chromium-only). Approximate RAM in GiB, rounded. */
  readonly deviceMemory?: number
}

interface Performance {
  /** Non-standard Chrome heap statistics. */
  readonly memory?: {
    readonly jsHeapSizeLimit: number
    readonly usedJSHeapSize: number
    readonly totalJSHeapSize: number
  }
}

interface GPUAdapterInfo {
  /** Non-standard Chromium field: per-heap VRAM sizes (bytes). */
  readonly memoryHeaps?: readonly { readonly size: number }[]
}
