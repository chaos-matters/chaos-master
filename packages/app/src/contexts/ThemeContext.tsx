import { createContext, createSignal,createTrackedEffect } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { Accessor, ParentProps } from 'solid-js'

export type Theme = 'light' | 'dark'

function applyThemeToBody(theme: Accessor<Theme>) {
  createTrackedEffect(() => {
    document.body.dataset.theme = theme()
  })
}

const ThemeContext = createContext<{
  theme: Accessor<Theme>
  setTheme: (value: Theme) => void
}>()

export function ThemeContextProvider(props: ParentProps) {
  const [theme, setTheme] = createSignal<Theme>('dark')
  applyThemeToBody(theme)
  return (
    <ThemeContext value={{ theme, setTheme }}>
      {props.children}
    </ThemeContext>
  )
}

export function useTheme() {
  return useContextSafe(ThemeContext, 'useTheme', 'ThemeContext')
}
