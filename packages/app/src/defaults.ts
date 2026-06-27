export const DEFAULT_POINT_COUNT = parseFloat(
  import.meta.env.VITE_DEFAULT_POINT_COUNT,
)
// Points each chaos-game chain plots after its warmup/fuse. Higher amortizes
// the warmup cost across more plotted points (throughput), at the cost of more
// per-dispatch work. Baked into the IFS shader as a compile-time loop bound.
export const PLOTS_PER_CHAIN = Math.max(
  1,
  Math.floor(Number(import.meta.env.VITE_PLOTS_PER_CHAIN ?? 16)),
)
// How many dispatches a persisted chain continues before it re-seeds + re-warms.
// Lower = more frequent re-warm: skipIters/warmup reads more strongly and the
// post-camera-move settle flicker shrinks (slow-mixing flames stay stationary),
// at a throughput cost. Higher → closer to pure persistence (max throughput).
// 1 = re-warm every dispatch (effectively no persistence).
export const PERSIST_RESEED_INTERVAL = Math.max(
  1,
  Math.floor(Number(import.meta.env.VITE_PERSIST_RESEED_INTERVAL ?? 32)),
)
export const DEFAULT_RESOLUTION = parseFloat(
  import.meta.env.VITE_DEFAULT_RESOLUTION,
)
export const DEFAULT_PREVIEW_PIXEL_RATIO = parseFloat(
  import.meta.env.VITE_DEFAULT_PREVIEW_PIXEL_RATIO,
)
export const DEFAULT_RENDER_INTERVAL_MS = parseFloat(
  import.meta.env.VITE_DEFAULT_RENDER_INTERVAL_MS,
)
export const DEFAULT_ZOOM_LEVEL = parseFloat(
  import.meta.env.VITE_DEFAULT_ZOOM_LEVEL,
)
export const DEFAULT_QUALITY = parseFloat(import.meta.env.VITE_DEFAULT_QUALITY)

export const DEFAULT_HIGH_QUALITY = parseFloat(
  import.meta.env.VITE_DEFAULT_HIGH_QUALITY,
)

export const DEFAULT_ULTRA_QUALITY = parseFloat(
  import.meta.env.VITE_DEFAULT_ULTRA_QUALITY,
)

// Animation frame preview quality presets (animation export gallery thumbnails)
export const ANIMATION_FRAME_PREVIEW_QUALITY_LOW = parseFloat(
  import.meta.env.VITE_ANIMATION_FRAME_PREVIEW_QUALITY_LOW ?? '0.97',
)
export const ANIMATION_FRAME_PREVIEW_QUALITY_MID = parseFloat(
  import.meta.env.VITE_ANIMATION_FRAME_PREVIEW_QUALITY_MID ?? '0.98',
)
export const ANIMATION_FRAME_PREVIEW_QUALITY_HIGH = parseFloat(
  import.meta.env.VITE_ANIMATION_FRAME_PREVIEW_QUALITY_HIGH ?? '0.99',
)

export const DEFAULT_VARIATION_SHOW_DELAY_MS = parseFloat(
  import.meta.env.VITE_DEFAULT_VARIATION_SHOW_DELAY_MS,
)

export const DEFAULT_VARIATION_PREVIEW_QUALITY = parseFloat(
  import.meta.env.VITE_DEFAULT_VARIATION_PREVIEW_QUALITY ?? '0.95',
)

export const DEFAULT_VARIATION_PREVIEW_POINT_COUNT = parseFloat(
  import.meta.env.VITE_DEFAULT_VARIATION_PREVIEW_POINT_COUNT,
)

// A 256x144 gallery thumbnail needs nowhere near a full preview's point count.
// Cap it independently so a heavy VITE_DEFAULT_VARIATION_PREVIEW_POINT_COUNT
// (e.g. 1e6, reasonable for one large preview) can't make every one of ~57
// gallery thumbnails allocate ~32MB of point buffers and OOM the page. Each
// point costs 32 bytes of buffers (vec2u + vec4f + vec2f), so 1e5 ≈ 3.2MB/tile.
export const GALLERY_PREVIEW_POINT_COUNT = Math.min(
  DEFAULT_VARIATION_PREVIEW_POINT_COUNT,
  1e5,
)

export const DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS = parseFloat(
  import.meta.env.VITE_DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS,
)

export const STATIC_PREVIEW_POINT_COUNT = parseFloat(
  import.meta.env.VITE_STATIC_PREVIEW_POINT_COUNT,
)

export const ANIMATION_PREVIEW_QUALITY = parseFloat(
  import.meta.env.VITE_ANIMATION_PREVIEW_QUALITY,
)

export const ANIMATION_PREVIEW_POINT_COUNT = parseFloat(
  import.meta.env.VITE_ANIMATION_PREVIEW_POINT_COUNT,
)

export const THUMBNAIL_PREVIEW_QUALITY = parseFloat(
  import.meta.env.VITE_THUMBNAIL_PREVIEW_QUALITY ?? '0.95',
)

export const THUMBNAIL_PREVIEW_QUALITY_HOVER = parseFloat(
  import.meta.env.VITE_THUMBNAIL_PREVIEW_QUALITY_HOVER ?? '0.999',
)

// Set to 'true' in .env.local to enable per-frame GPU timing.
// Disabled by default: resolveQuerySet(384 slots) every frame causes device loss
// on Firefox/Linux with GFX1201 (RDNA4) due to a wgpu/RADV timestamp-query bug.
export const TRACK_PERFORMANCE =
  import.meta.env.VITE_TRACK_PERFORMANCE === 'true'

export const CANVAS_RESIZE_DEBOUNCE_MS = Number.parseInt(
  import.meta.env.VITE_CANVAS_RESIZE_DEBOUNCE_MS ?? '300',
  10,
)

// Enable comprehensive WebGPU buffer lifecycle logging.
// Set VITE_DEBUG_VRAM=true in .env.local to trace memory leaks.
export const DEBUG_VRAM = import.meta.env.VITE_DEBUG_VRAM === 'true'

// EXPERIMENT (default OFF): on a real reload/unload, synchronously destroy the
// tgpu Roots (freeing their VRAM) before the reloaded page initializes — Firefox
// reloads so fast that the deferred onSubmittedWorkDone destroys never run, so
// old VRAM lingers during the new page's allocation (transient double pressure
// that can tip the GFX1201 GPU process over). NEVER destroys the GPUDevice —
// device.destroy() after submitted work hits an upstream wgpu-hal panic that
// crashes the Firefox GPU process (deno/deno#21648). A/B with VITE_PAGEHIDE_CLEANUP.
export const PAGEHIDE_CLEANUP = import.meta.env.VITE_PAGEHIDE_CLEANUP === 'true'

// Default for the "camera control during render" opt-in in the animation
// render dialog. When enabled, pan/scroll/zoom stay active during an
// animation export: camera input re-renders the in-progress frame under the
// user's camera and bakes it into the video — a creative live-control tool,
// off by default so exports are deterministic.
export const ALLOW_CAMERA_DURING_EXPORT =
  import.meta.env.VITE_ALLOW_CAMERA_DURING_EXPORT === 'true'

export const COMPUTE_GATE_CAPACITY = parseFloat(
  import.meta.env.VITE_COMPUTE_GATE_CAPACITY ?? '2',
)

export const CAMERA_UNDO_DEBOUNCE_MS =
  parseFloat(import.meta.env.VITE_CAMERA_UNDO_DEBOUNCE_MS) || 300

export const DEBUG_MODE = import.meta.env.VITE_DEBUG_MODE === 'true'
export const IS_DEV = import.meta.env.DEV
export const BASE_URL = import.meta.env.BASE_URL
