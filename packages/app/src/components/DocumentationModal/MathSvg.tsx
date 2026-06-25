import { createResource, Show } from 'solid-js'
import { ensureMathJax, renderTexToSvg } from '@/utils/mathjax'
import ui from './DocumentationModal.module.css'

/**
 * Renders a LaTeX string to an inline MathJax SVG. MathJax loads lazily and is
 * cached after first use (see {@link ensureMathJax}).
 */
export function MathSvg(props: {
  tex: string
  display?: boolean
  inline?: boolean
}) {
  const [svg] = createResource(
    () => props.tex,
    async (tex) => {
      await ensureMathJax()
      return renderTexToSvg(tex, props.display ?? true) ?? ''
    },
  )

  return (
    <Show when={svg()} fallback={<span class={ui.muted}>Rendering…</span>}>
      {/* MathJax emits its own well-formed SVG markup. */}
      <span
        class={ui.math}
        classList={{ [ui.mathInline!]: props.inline }}
        innerHTML={svg()}
      />
    </Show>
  )
}
