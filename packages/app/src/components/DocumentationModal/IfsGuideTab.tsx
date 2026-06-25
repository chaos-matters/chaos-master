import ui from './DocumentationModal.module.css'
import { MathSvg } from './MathSvg'

/**
 * Static prose guide explaining how the Iterated Function System / chaos-game
 * pipeline turns variations into a rendered flame. Formulas render via MathSvg.
 */
export function IfsGuideTab() {
  return (
    <div class={ui.guide}>
      <h3 class={ui.guideTitle}>Iterated Function Systems (IFS)</h3>
      <p>
        An <strong>Iterated Function System (IFS)</strong> builds fractals from
        a finite set of contraction mappings. Chaos Master evaluates them in
        parallel on the GPU via <strong>WebGPU</strong>.
      </p>
      <p>
        Generation starts from a random point and repeatedly applies one of the
        transformation chains, chosen at random in proportion to each
        transform's weight.
      </p>

      <h4>The transformation chain</h4>
      <p>
        For each chosen transform, the coordinate{' '}
        <MathSvg tex="v" display={false} inline /> passes through three steps in
        order:
      </p>
      <ol>
        <li>
          <strong>Pre-affine transformation</strong> — rotate, scale, and
          translate the point:
          <div class={ui.formulaBlock}>
            <MathSvg tex="v_{\text{affine}} = M_{\text{pre}} \cdot v + T_{\text{pre}}" />
          </div>
        </li>
        <li>
          <strong>Variation evaluation</strong> — apply the weighted sum of the
          non-linear variations documented here:
          <div class={ui.formulaBlock}>
            <MathSvg tex="v_{\text{var}} = \sum_j w_j \cdot V_j(v_{\text{affine}})" />
          </div>
        </li>
        <li>
          <strong>Post-affine transformation</strong> — optionally transform the
          variation output before it is plotted:
          <div class={ui.formulaBlock}>
            <MathSvg tex="v_{\text{final}} = M_{\text{post}} \cdot v_{\text{var}} + T_{\text{post}}" />
          </div>
        </li>
      </ol>

      <h4>The chaos game</h4>
      <p>
        Applying these functions millions of times and accumulating where the
        points land makes the fractal emerge. Density estimation, log-exposure
        scaling, and color grading then produce the final image on the canvas.
      </p>
    </div>
  )
}
