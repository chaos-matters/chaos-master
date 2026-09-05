import { describe, expect, it } from 'vitest'
import { SchemaParamEditor } from '@/components/Sliders/ParametricEditors/SchemaParamEditor'
import { registerCustomParamEditor, resolveParamEditor, } from './paramEditorRegistry'
import { getParamsEditor } from './utils'
import type { Component } from 'solid-js'

describe('paramEditorRegistry', () => {
  it('falls back to SchemaParamEditor when no custom editor is registered', () => {
    const editor = resolveParamEditor('unknownNonExistentVar')
    expect(editor).toBe(SchemaParamEditor)
  })

  it('resolves provided fallback if specified', () => {
    const customFallback: Component = () => null
    const editor = resolveParamEditor('testFallbackVar', customFallback)
    expect(editor).toBe(customFallback)
  })

  it('registers and resolves a custom editor loader', () => {
    const dummyComponent: Component = () => null
    registerCustomParamEditor('testLazyVar', () =>
      Promise.resolve({
        default: dummyComponent,
      }),
    )

    const resolved = resolveParamEditor('testLazyVar')
    expect(resolved).toBeDefined()
    expect(typeof resolved).toBe('function')

    // Verifies cache reuse
    const cached = resolveParamEditor('testLazyVar')
    expect(cached).toBe(resolved)
  })

  it('getParamsEditor returns component and value for parametric variations', () => {
    const variation = {
      type: 'blobVar',
      params: { high: 2, low: 1, waves: 3 },
    }

    const editor = getParamsEditor(variation)
    expect(editor.component).toBeDefined()
    expect(editor.value).toEqual({ high: 2, low: 1, waves: 3 })
  })
})
