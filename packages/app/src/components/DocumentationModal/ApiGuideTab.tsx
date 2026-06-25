import { CodeBlock } from './CodeBlock'
import ui from './DocumentationModal.module.css'

// Mirrors the runtime environment in flame/variations/custom/runtimeCompiler.ts
// — a custom variation body is `(pos, varInfo) => { ... }` with PI/EPS, vec2f,
// f32 and the WGSL math builtins available.
const CUSTOM_VARIATION_EXAMPLE = `let r = length(pos);
let theta = atan2(pos.y, pos.x);
let ripple = sin(r * 8.0) * 0.5 + 0.5;
let newR = r + ripple * 0.2 * varInfo.weight;
return vec2f(newR * cos(theta), newR * sin(theta));`

/**
 * Static reference for authoring custom variations in the Custom Variation
 * Editor (JS subset transpiled to WGSL at runtime).
 */
export function ApiGuideTab() {
  return (
    <div class={ui.guide}>
      <h3 class={ui.guideTitle}>API &amp; custom variations</h3>
      <p>
        The <strong>Custom Variation Editor</strong> lets you program your own
        variation in a subset of JavaScript that is transpiled to WebGPU Shading
        Language (WGSL) at runtime.
      </p>

      <h4>Environment bindings</h4>
      <p>A custom variation body runs as a function of two arguments:</p>
      <ul>
        <li>
          <code>pos</code> — a <code>vec2f</code> with the current coordinate{' '}
          <code>(x, y)</code>.
        </li>
        <li>
          <code>varInfo</code> — a struct; <code>varInfo.weight</code> is this
          variation's weight in the transform.
        </li>
        <li>
          <code>PI</code>, <code>EPS</code> — standard math constants;{' '}
          <code>vec2f</code> and <code>f32</code> constructors are also
          available.
        </li>
      </ul>

      <h4>WGSL example</h4>
      <CodeBlock code={CUSTOM_VARIATION_EXAMPLE} />

      <h4>Supported built-in functions</h4>
      <p>
        Standard WGSL math functions may be called: <code>sin</code>,{' '}
        <code>cos</code>, <code>tan</code>, <code>asin</code>, <code>acos</code>
        , <code>atan</code>, <code>atan2</code>, <code>sinh</code>,{' '}
        <code>cosh</code>, <code>tanh</code>, <code>pow</code>, <code>exp</code>
        , <code>log</code>, <code>sqrt</code>, <code>abs</code>,{' '}
        <code>min</code>, <code>max</code>, <code>clamp</code>,{' '}
        <code>length</code>, <code>distance</code>, and <code>dot</code>.
      </p>
    </div>
  )
}
