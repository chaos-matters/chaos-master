import { createResource, createSignal, Show } from 'solid-js'
import { categoryOf } from '@/flame/variationRegistry'
import { allTransformVariations } from '@/flame/variations'
import { CATEGORY_LABELS } from '@/flame/variations/categories'
import { getVariationDoc } from '@/flame/variations/docs'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import { Check, Copy, Info } from '@/icons'
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
  const [copiedId, setCopiedId] = createSignal(false)

  const doc = () => getVariationDoc(props.type)
  const category = () => categoryOf(props.dims, props.type)
  const paramCount = () =>
    Object.keys(VARIATIONS[props.type]?.paramDefaults ?? {}).length

  const handleCopyId = () => {
    if (globalThis.navigator?.clipboard) {
      void globalThis.navigator.clipboard.writeText(props.type).then(() => {
        setCopiedId(true)
        setTimeout(() => setCopiedId(false), 2000)
      })
    }
  }

  // Source typed as `string` via the annotated accessor so the resource generic
  // doesn't instantiate over the ~600-member variation union (TS2590). An `as`
  // cast here would be stripped by eslint's no-unnecessary-type-assertion.
  const typeId = (): string => props.type
  const [tsSource] = createResource(typeId, variationTsSource)
  const wgsl = () => resolveVariationWgsl(props.type)

  return (
    <div class={ui.detail}>
      <header class={ui.detailHeader}>
        <div class={ui.detailTitleRow}>
          <h2 class={ui.detailName}>
            {getNormalizedVariationName(props.type)}
          </h2>
          <div class={ui.detailBadgeGroup}>
            <button
              type="button"
              class={ui.typeIdBadge}
              title="Click to copy variation ID"
              onClick={handleCopyId}
            >
              <code>{props.type}</code>
              <Show
                when={copiedId()}
                fallback={<Copy width="13" height="13" class={ui.copyIcon} />}
              >
                <Check width="13" height="13" class={ui.checkIcon} />
              </Show>
            </button>
            <Show when={category()}>
              <span class={ui.categoryBadge}>
                <span class={ui.categoryDot} />
                {CATEGORY_LABELS[category()!]}
              </span>
            </Show>
            <span class={ui.dimBadge}>{props.dims}D</span>
            <span class={ui.paramCountBadge}>
              {paramCount()} {paramCount() === 1 ? 'parameter' : 'parameters'}
            </span>
          </div>
        </div>
      </header>

      <div class={ui.summaryCard}>
        <Show
          when={doc()?.summary}
          fallback={
            <div class={ui.infoNotice}>
              <Info width="15" height="15" class={ui.infoIcon} />
              <span>
                Documentation summary is in progress for this variation.
              </span>
            </div>
          }
        >
          <p class={ui.summaryText}>{doc()!.summary}</p>
        </Show>
      </div>

      <div class={ui.subTabBar}>
        <button
          type="button"
          class={ui.subTab}
          classList={{ [ui.subTabActive!]: subTab() === 'math' }}
          onClick={() => setSubTab('math')}
        >
          Formula
        </button>
        <button
          type="button"
          class={ui.subTab}
          classList={{ [ui.subTabActive!]: subTab() === 'code' }}
          onClick={() => setSubTab('code')}
        >
          Shader Code
        </button>
      </div>

      <div class={ui.subPanel}>
        <Show when={subTab() === 'math'}>
          <Show
            when={doc()?.tex}
            fallback={
              <div class={ui.emptyNoticeCard}>
                <div class={ui.emptyNoticeIcon}>
                  <Info width="18" height="18" />
                </div>
                <div class={ui.emptyNoticeContent}>
                  <div class={ui.emptyNoticeTitle}>
                    No Mathematical Formula Documented
                  </div>
                  <div class={ui.emptyNoticeText}>
                    The mathematical formulation for this variation is not
                    explicitly documented. Please inspect the implementation in
                    the <strong>Shader Code</strong> tab.
                  </div>
                </div>
              </div>
            }
          >
            <div class={ui.mathStageCard}>
              <div class={ui.mathStageHeader}>
                <span class={ui.mathStageLabel}>Transformation Formula</span>
              </div>
              <div class={ui.mathWrap}>
                <MathSvg tex={doc()!.tex!} />
              </div>
            </div>
          </Show>
        </Show>

        <Show when={subTab() === 'code'}>
          <div class={ui.codeToolbar}>
            <div class={ui.codeLangSegmented}>
              <button
                type="button"
                class={ui.codeToggle}
                classList={{ [ui.codeToggleActive!]: lang() === 'ts' }}
                onClick={() => setLang('ts')}
              >
                TypeGPU (TS)
              </button>
              <button
                type="button"
                class={ui.codeToggle}
                classList={{ [ui.codeToggleActive!]: lang() === 'wgsl' }}
                onClick={() => setLang('wgsl')}
              >
                WGSL Shader
              </button>
            </div>
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
                    <CodeBlock code={wgsl()!} language="wgsl" />
                  </Show>
                }
              >
                <CodeBlock code={tsSource()!} language="typescript" />
              </Show>
            </Show>
          </Show>
          <Show when={lang() === 'wgsl'}>
            <Show
              when={wgsl()}
              fallback={<p class={ui.muted}>WGSL could not be resolved.</p>}
            >
              <CodeBlock code={wgsl()!} language="wgsl" />
            </Show>
          </Show>
        </Show>
      </div>

      <section class={ui.paramsBox}>
        <div class={ui.paramsHeaderRow}>
          <h3 class={ui.paramsTitle}>Parameters Overview</h3>
          <span class={ui.paramsCountBadge}>{paramCount()}</span>
        </div>
        <ParametersOverview type={props.type} />
      </section>
    </div>
  )
}
