import { For } from 'solid-js'
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

const ENVIRONMENT_BINDINGS = [
  {
    name: 'pos',
    type: 'vec2f',
    desc: 'The current 2D coordinate (x, y) arriving at this stage.',
  },
  {
    name: 'varInfo',
    type: 'struct',
    desc: 'Transform contextual data; varInfo.weight is this variation’s weight.',
  },
  {
    name: 'PI, EPS',
    type: 'f32',
    desc: 'Standard math constants: π ≈ 3.14159265 and numerical epsilon.',
  },
]

const FUNCTION_CATEGORIES = [
  {
    category: 'Trigonometric',
    functions: ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2'],
  },
  {
    category: 'Hyperbolic',
    functions: ['sinh', 'cosh', 'tanh'],
  },
  {
    category: 'Exponential & Power',
    functions: ['pow', 'exp', 'log', 'sqrt'],
  },
  {
    category: 'Vector & Math Utilities',
    functions: ['abs', 'min', 'max', 'clamp', 'length', 'distance', 'dot'],
  },
]

/**
 * Static reference for authoring custom variations in the Custom Variation
 * Editor (JS subset transpiled to WGSL at runtime).
 */
export function ApiGuideTab() {
  return (
    <div class={ui.guide}>
      <header class={ui.guideHero}>
        <h3 class={ui.guideTitle}>API &amp; Custom Variations</h3>
        <p class={ui.guideIntro}>
          The <strong>Custom Variation Editor</strong> allows authoring custom
          non-linear flame transformations in a safe mathematical JavaScript
          subset that is transpiled to high-performance WebGPU Shading Language
          (WGSL) at runtime.
        </p>
      </header>

      <section class={ui.guideSection}>
        <h4 class={ui.guideSectionTitle}>Environment Bindings</h4>
        <div class={ui.bindingGrid}>
          <For each={ENVIRONMENT_BINDINGS}>
            {(b) => (
              <div class={ui.bindingCard}>
                <div class={ui.bindingNameRow}>
                  <code class={ui.bindingName}>{b.name}</code>
                  <span class={ui.bindingType}>{b.type}</span>
                </div>
                <p class={ui.bindingDesc}>{b.desc}</p>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class={ui.guideSection}>
        <h4 class={ui.guideSectionTitle}>WGSL Implementation Example</h4>
        <CodeBlock code={CUSTOM_VARIATION_EXAMPLE} language="wgsl" />
      </section>

      <section class={ui.guideSection}>
        <h4 class={ui.guideSectionTitle}>Supported Built-in WGSL Functions</h4>
        <div class={ui.fnCategoryGrid}>
          <For each={FUNCTION_CATEGORIES}>
            {(c) => (
              <div class={ui.fnCategoryCard}>
                <span class={ui.fnCategoryName}>{c.category}</span>
                <div class={ui.fnChipGroup}>
                  <For each={c.functions}>
                    {(fnName) => <code class={ui.fnChip}>{fnName}</code>}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  )
}
