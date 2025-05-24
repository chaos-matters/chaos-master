import { createContext, createEffect } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { Accessor, ContextProviderComponent } from 'solid-js'

export type Theme = 'light' | 'dark'

function applyThemeToBody(theme: Accessor<Theme>) {
  createEffect(() => {
    document.body.dataset.theme = theme()
  })
}

const ThemeContext = createContext<Accessor<Theme>>()

export const ThemeContextProvider: ContextProviderComponent<Theme> = (
  props,
) => {
  applyThemeToBody(() => props.value)
  return (
    <ThemeContext.Provider value={() => props.value}>
      {props.children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContextSafe(ThemeContext, 'useTheme', 'ThemeContext')
}
