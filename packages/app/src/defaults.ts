export const DEFAULT_POINT_COUNT = parseFloat(
  import.meta.env.VITE_DEFAULT_POINT_COUNT,
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
  import.meta.env.VITE_ANIMATION_FRAME_PREVIEW_QUALITY_LOW ?? '0.95',
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

export const DEFAULT_VARIATION_PREVIEW_POINT_COUNT = parseFloat(
  import.meta.env.VITE_DEFAULT_VARIATION_PREVIEW_POINT_COUNT,
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

export const COMPUTE_GATE_CAPACITY = parseFloat(
  import.meta.env.VITE_COMPUTE_GATE_CAPACITY ?? '2',
)

export const CAMERA_UNDO_DEBOUNCE_MS =
  parseFloat(import.meta.env.VITE_CAMERA_UNDO_DEBOUNCE_MS) || 300

export const DEBUG_MODE = import.meta.env.VITE_DEBUG_MODE === 'true'
export const IS_DEV = import.meta.env.DEV
