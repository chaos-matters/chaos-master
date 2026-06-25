import { createEffect, For, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { ParamMetaCaptureProvider } from '@/components/Sliders/ParametricEditors/paramMetaCapture'
import { allTransformVariations } from '@/flame/variations'
import { getVariationDoc } from '@/flame/variations/docs'
import ui from './DocumentationModal.module.css'
import type { Component } from 'solid-js'
import type { CapturedParamMeta, ParamValueType, } from '@/components/Sliders/ParametricEditors/paramMetaCapture'
import type { EditorProps } from '@/components/Sliders/ParametricEditors/types'
import type { AnyVariationType } from '@/flame/variationRegistry'
import type { ParamDoc } from '@/flame/variations/docs'

type ParamEditor = Component<EditorProps<Record<string, number>>>

// Index by plain string: `keyof typeof allTransformVariations` is a ~300-member
// union whose indexed-access type is too complex for tsc to represent (TS2590).
const VARIATIONS = allTransformVariations as unknown as Record<
  string,
  { paramDefaults?: Record<string, number>; editor?: ParamEditor }
>

// Best-effort angle detection for params whose editor we couldn't probe.
const ANGLE_NAME = /angle|rot|theta|phi|spin|twist|tilt|yaw|pitch|roll/i

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString()
}

function radToDeg(r: number): number {
  return Math.round((r * 180) / Math.PI)
}

function formatCapturedRange(meta: CapturedParamMeta): string | undefined {
  if (meta.valueType === 'bool') return '0 / 1'
  if (meta.valueType === 'angle') {
    return `${radToDeg(meta.min ?? 0)}° … ${radToDeg(meta.max ?? 2 * Math.PI)}°`
  }
  if (meta.min === undefined || meta.max === undefined) return undefined
  return `${formatNumber(meta.min)} … ${formatNumber(meta.max)}`
}

/**
 * Lists a parametric variation's parameters. The field list + defaults come from
 * the variation's `paramDefaults`; the value-type and range are DERIVED by
 * probing the variation's real editor (a hidden render in capture mode — see
 * paramMetaCapture). Authored docs, when present, override the derived values
 * and supply the description. New variations need no extra metadata.
 */
export function ParametersOverview(props: { type: AnyVariationType }) {
  const entry = () => VARIATIONS[props.type]
  const fields = () => Object.keys(entry()?.paramDefaults ?? {})
  const doc = () => getVariationDoc(props.type)

  // Editor metadata captured by the probe, keyed by param field. Reset on
  // variation change; the probe repopulates it on mount.
  const [captured, setCaptured] = createStore<
    Record<string, CapturedParamMeta>
  >({})
  createEffect(() => {
    void props.type
    setCaptured(reconcile({}))
  })
  const report = (m: CapturedParamMeta) => {
    if (m.paramKey !== undefined) setCaptured(m.paramKey, m)
  }

  const valueTypeOf = (name: string): ParamValueType | undefined => {
    const authored = doc()?.params?.[name]?.valueType
    if (authored) return authored
    const cap = captured[name]
    if (cap) return cap.valueType
    return ANGLE_NAME.test(name) ? 'angle' : undefined
  }

  const rangeOf = (name: string): string | undefined => {
    const authored = doc()?.params?.[name]?.range
    if (authored) {
      return `${formatNumber(authored[0])} … ${formatNumber(authored[1])}`
    }
    const cap = captured[name]
    return cap ? formatCapturedRange(cap) : undefined
  }

  return (
    <Show
      when={fields().length > 0}
      fallback={<p class={ui.muted}>This variation takes no parameters.</p>}
    >
      {/* Hidden probe: renders the real editor in capture mode. Its primitives
          report each param's range/type and render nothing, so there is no UI. */}
      <Show when={entry()?.editor}>
        <ParamMetaCaptureProvider report={report}>
          <Dynamic
            component={entry()!.editor}
            value={entry()!.paramDefaults ?? {}}
            setValue={() => {}}
          />
        </ParamMetaCaptureProvider>
      </Show>

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
                    <Show when={valueTypeOf(name)} fallback="—">
                      {(vt) => <span class={ui.paramType}>{vt()}</span>}
                    </Show>
                  </td>
                  <td class={ui.paramMono}>{rangeOf(name) ?? '—'}</td>
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
