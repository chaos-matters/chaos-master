import { useContext } from 'solid-js'
import type { Context } from 'solid-js'

export function useContextSafe<T>(
  context: Context<T>,
  hookName: string,
  providerComponentName: string,
) {
  const maybeContext = useContext(context)
  if (maybeContext === undefined) {
    throw new Error(
      `Called '${hookName}' outside of ${
        providerComponentName ? `<${providerComponentName}>` : 'its Provider'
      }.`,
    )
  }
  return maybeContext
}
