import { lazy } from 'solid-js'
import { SchemaParamEditor } from '@/components/Sliders/ParametricEditors/SchemaParamEditor'
import type { Component } from 'solid-js'
import type { EditorProps } from '@/components/Sliders/ParametricEditors/types'

// Dynamic registry mapping variation types to lazy editor component loaders.
// Only specialized editors need an entry here; everything else uses SchemaParamEditor.
const customEditorLoaders: Record<
  string,
  () => Promise<{ default: Component<EditorProps<Record<string, number>>> }>
> = {}

export function registerCustomParamEditor(
  type: string,
  loader: () => Promise<{
    default: Component<EditorProps<Record<string, number>>>
  }>,
): void {
  customEditorLoaders[type] = loader
}

const lazyComponentCache = new Map<
  string,
  Component<EditorProps<Record<string, number>>>
>()

export function resolveParamEditor(
  type: string,
  fallback?: Component<EditorProps<Record<string, number>>>,
): Component<EditorProps<Record<string, number>>> {
  if (lazyComponentCache.has(type)) {
    return lazyComponentCache.get(type)!
  }

  const loader = customEditorLoaders[type]
  if (loader) {
    const lazyComponent = lazy(loader)
    lazyComponentCache.set(type, lazyComponent)
    return lazyComponent
  }

  if (fallback) {
    return fallback
  }

  return SchemaParamEditor
}
