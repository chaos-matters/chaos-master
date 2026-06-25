import { createResource, createSignal, Show } from 'solid-js'
import { categoryOf } from '@/flame/variationRegistry'
import { allTransformVariations } from '@/flame/variations'
import { CATEGORY_LABELS } from '@/flame/variations/categories'
import { getVariationDoc } from '@/flame/variations/docs'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import { resolveVariationWgsl, variationTsSource, } from '@/utils/variationSource'
import { CodeBlock } from './CodeBlock'
import ui from './DocumentationModal.module.css'
import { MathSvg } from './MathSvg'
import { ParametersOverview } from './ParametersOverview'
import type { AnyVariationType, Dims } from '@/flame/variationRegistry'

type DetailSubTab = 'math' | 'code'
type CodeLang = 'ts' | 'wgsl'

// Index by plain string to avoid the ~300-member keyof union (TS2590).
const VARIATIONS = allTransformVariations as unknown as Record<
  string,
  { paramDefaults?: Record<string, number> }
>

/** Right-hand pane: description + math/code + parameter overview for one variation. */
export function SelectedVariationPanel(props: {
  type: AnyVariationType
  dims: Dims
}) {
  const [subTab, setSubTab] = createSignal<DetailSubTab>('math')
  const [lang, setLang] = createSignal<CodeLang>('ts')

  const doc = () => getVariationDoc(props.type)
  const category = () => categoryOf(props.dims, props.type)
  const paramCount = () =>
    Object.keys(VARIATIONS[props.type]?.paramDefaults ?? {}).length

  // Source typed as `string` via the annotated accessor so the resource generic
  // doesn't instantiate over the ~600-member variation union (TS2590). An `as`
  // cast here would be stripped by eslint's no-unnecessary-type-assertion.
  const typeId = (): string => props.type
  const [tsSource] = createResource(typeId, variationTsSource)
  const wgsl = () => resolveVariationWgsl(props.type)

  return (
    <div class={ui.detail}>
      <header class={ui.detailHeader}>
        <h2 class={ui.detailName}>{getNormalizedVariationName(props.type)}</h2>
        <div class={ui.detailMeta}>
          <span class={ui.detailTag}>{props.type}</span>
          <Show when={category()}>
            <span class={ui.detailTag}>{CATEGORY_LABELS[category()!]}</span>
          </Show>
          <span class={ui.detailTag}>
            {paramCount()} {paramCount() === 1 ? 'param' : 'params'}
          </span>
        </div>
      </header>

      <Show
        when={doc()?.summary}
        fallback={<p class={ui.muted}>This variation isn’t documented yet.</p>}
      >
        <p class={ui.summary}>{doc()!.summary}</p>
      </Show>

      <div class={ui.subTabBar}>
        <button
          class={ui.subTab}
          classList={{ [ui.subTabActive!]: subTab() === 'math' }}
          onClick={() => setSubTab('math')}
        >
          Math
        </button>
        <button
          class={ui.subTab}
          classList={{ [ui.subTabActive!]: subTab() === 'code' }}
          onClick={() => setSubTab('code')}
        >
          Code
        </button>
      </div>

      <div class={ui.subPanel}>
        <Show when={subTab() === 'math'}>
          <Show
            when={doc()?.tex}
            fallback={
              <p class={ui.muted}>No formula documented for this variation.</p>
            }
          >
            <div class={ui.mathWrap}>
              <MathSvg tex={doc()!.tex!} />
            </div>
          </Show>
        </Show>

        <Show when={subTab() === 'code'}>
          <div class={ui.codeToolbar}>
            <button
              class={ui.codeToggle}
              classList={{ [ui.codeToggleActive!]: lang() === 'ts' }}
              onClick={() => setLang('ts')}
            >
              TypeGPU (TS)
            </button>
            <button
              class={ui.codeToggle}
              classList={{ [ui.codeToggleActive!]: lang() === 'wgsl' }}
              onClick={() => setLang('wgsl')}
            >
              WGSL
            </button>
          </div>
          <Show when={lang() === 'ts'}>
            <Show
              when={!tsSource.loading}
              fallback={<p class={ui.muted}>Loading source…</p>}
            >
              <Show
                when={tsSource()}
                fallback={
                  // 3D variations are defined inline (no per-file TS source),
                  // so fall back to the resolved WGSL — there's always a source.
                  <Show
                    when={wgsl()}
                    fallback={<p class={ui.muted}>Source not available.</p>}
                  >
                    <p class={ui.muted}>
                      No standalone TypeScript source for this variation —
                      showing the resolved WGSL.
                    </p>
                    <CodeBlock code={wgsl()!} />
                  </Show>
                }
              >
                <CodeBlock code={tsSource()!} />
              </Show>
            </Show>
          </Show>
          <Show when={lang() === 'wgsl'}>
            <Show
              when={wgsl()}
              fallback={<p class={ui.muted}>WGSL could not be resolved.</p>}
            >
              <CodeBlock code={wgsl()!} />
            </Show>
          </Show>
        </Show>
      </div>

      <section class={ui.paramsBox}>
        <h3 class={ui.paramsTitle}>Parameters Overview</h3>
        <ParametersOverview type={props.type} />
      </section>
    </div>
  )
}
