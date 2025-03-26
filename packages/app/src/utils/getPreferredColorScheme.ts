export type ColorScheme = 'light' | 'dark'
export function getPreferredColorScheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}
