import { createContext, createEffect, createSignal } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { Accessor, ParentProps } from 'solid-js'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'cm-ui-theme'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage may be unavailable (e.g. private browsing)
  }
  return 'dark'
}

function applyThemeToBody(theme: Accessor<Theme>) {
  createEffect(() => {
    document.body.dataset.theme = theme()
  })
}

const ThemeContext = createContext<{
  theme: Accessor<Theme>
  setTheme: (value: Theme) => void
}>()

export function ThemeContextProvider(props: ParentProps) {
  const [theme, rawSetTheme] = createSignal<Theme>(readStoredTheme())
  applyThemeToBody(theme)

  function setTheme(value: Theme) {
    rawSetTheme(value)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // ignore
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {props.children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContextSafe(ThemeContext, 'useTheme', 'ThemeContext')
}
