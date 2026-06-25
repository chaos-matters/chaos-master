import { For, Show } from 'solid-js'
import { allTransformVariations } from '@/flame/variations'
import { getVariationDoc } from '@/flame/variations/docs'
import ui from './DocumentationModal.module.css'
import type { AnyVariationType } from '@/flame/variationRegistry'
import type { ParamDoc } from '@/flame/variations/docs'

// Index by plain string: `keyof typeof allTransformVariations` is a ~300-member
// union whose indexed-access type is too complex for tsc to represent (TS2590).
const VARIATIONS = allTransformVariations as unknown as Record<
  string,
  { paramDefaults?: Record<string, number> }
>

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString()
}

function formatRange(range: readonly [number, number]): string {
  return `${formatNumber(range[0])} … ${formatNumber(range[1])}`
}

/**
 * Lists a parametric variation's parameters. Description / range / value-type
 * come from authored docs; the field list and defaults are derived from the
 * variation's `paramDefaults` so undocumented params still appear.
 */
export function ParametersOverview(props: { type: AnyVariationType }) {
  const entry = () => VARIATIONS[props.type]
  const fields = () => Object.keys(entry()?.paramDefaults ?? {})
  const doc = () => getVariationDoc(props.type)

  return (
    <Show
      when={fields().length > 0}
      fallback={<p class={ui.muted}>This variation takes no parameters.</p>}
    >
      <table class={ui.paramsTable}>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Range</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <For each={fields()}>
            {(name) => {
              const pd = (): ParamDoc | undefined => doc()?.params?.[name]
              const def = () => entry()?.paramDefaults?.[name]
              return (
                <tr>
                  <td class={ui.paramName}>{name}</td>
                  <td>
                    <Show when={pd()?.valueType} fallback="—">
                      <span class={ui.paramType}>{pd()!.valueType}</span>
                    </Show>
                  </td>
                  <td class={ui.paramMono}>
                    <Show when={pd()?.range} fallback="—">
                      {formatRange(pd()!.range!)}
                    </Show>
                  </td>
                  <td class={ui.paramMono}>
                    <Show when={def() !== undefined} fallback="—">
                      {formatNumber(def()!)}
                    </Show>
                  </td>
                  <td class={ui.paramDesc}>
                    {pd()?.description ?? 'Not yet documented.'}
                  </td>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </Show>
  )
}
