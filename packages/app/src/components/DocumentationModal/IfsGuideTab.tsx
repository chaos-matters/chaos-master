import ui from './DocumentationModal.module.css'
import { MathSvg } from './MathSvg'

/**
 * Static prose guide explaining how the Iterated Function System / chaos-game
 * pipeline turns variations into a rendered flame. Formulas render via MathSvg.
 */
export function IfsGuideTab() {
  return (
    <div class={ui.guide}>
      <header class={ui.guideHero}>
        <h3 class={ui.guideTitle}>Iterated Function Systems (IFS)</h3>
        <p class={ui.guideIntro}>
          An <strong>Iterated Function System (IFS)</strong> builds complex
          fractal attractors from a finite set of contraction mappings. Chaos
          Master evaluates millions of particle trajectories simultaneously on
          the GPU via <strong>WebGPU</strong> compute pipelines.
        </p>
      </header>

      <section class={ui.guideSection}>
        <h4 class={ui.guideSectionTitle}>The Transformation Pipeline</h4>
        <p class={ui.muted}>
          At every iteration of the chaos game, a transform is selected at
          random according to its relative weight. The coordinate passes
          sequentially through three distinct stages:
        </p>

        <div class={ui.stepCard}>
          <div class={ui.stepCardHeader}>
            <span class={ui.stepBadge}>Step 1</span>
            <span class={ui.stepTitle}>Pre-Affine Transformation</span>
          </div>
          <p class={ui.stepDesc}>
            Linear scaling, rotation, shearing, and translation applied to the
            input coordinate before evaluating non-linear variations:
          </p>
          <div class={ui.formulaBlock}>
            <MathSvg tex="v_{\text{affine}} = M_{\text{pre}} \cdot v + T_{\text{pre}}" />
          </div>
        </div>

        <div class={ui.stepCard}>
          <div class={ui.stepCardHeader}>
            <span class={ui.stepBadge}>Step 2</span>
            <span class={ui.stepTitle}>Variation Evaluation</span>
          </div>
          <p class={ui.stepDesc}>
            Evaluation of the weighted sum of non-linear variation formulas
            selected on this transform:
          </p>
          <div class={ui.formulaBlock}>
            <MathSvg tex="v_{\text{var}} = \sum_j w_j \cdot V_j(v_{\text{affine}})" />
          </div>
        </div>

        <div class={ui.stepCard}>
          <div class={ui.stepCardHeader}>
            <span class={ui.stepBadge}>Step 3</span>
            <span class={ui.stepTitle}>Post-Affine Transformation</span>
          </div>
          <p class={ui.stepDesc}>
            Optional secondary linear affine transform repositioning the
            variation output before histogram accumulation:
          </p>
          <div class={ui.formulaBlock}>
            <MathSvg tex="v_{\text{final}} = M_{\text{post}} \cdot v_{\text{var}} + T_{\text{post}}" />
          </div>
        </div>
      </section>

      <div class={ui.chaosCard}>
        <h4 class={ui.chaosTitle}>The Chaos Game &amp; Density Estimation</h4>
        <p class={ui.chaosDesc}>
          By repeating this three-step pipeline millions of times per frame, the
          invariant measure of the attractor emerges in the GPU histogram
          buffer. High-dynamic-range density estimation, logarithmic exposure
          tonemapping, spatial filtering, and perceptual color grading are then
          applied to render the final flame onto the display canvas.
        </p>
      </div>
    </div>
  )
}
