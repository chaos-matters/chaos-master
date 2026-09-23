// Easing curves and interpolation helpers for the timeline and glide. The
// implementation lives in @chaos-master/core, next to the EasingCurve schema it
// reads; the app keeps importing it from here.
export { applyEasing, catmullRom, clamp, lerp } from '@chaos-master/core'
