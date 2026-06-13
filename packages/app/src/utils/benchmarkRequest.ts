/**
 * The "request benchmark" entry point: a `?benchmark` query param that makes
 * the app skip the welcome screen and open the benchmark dialog on load.
 *
 * Treated as requested when the param is present and not explicitly disabled,
 * so `?benchmark`, `?benchmark=1` and `?benchmark=true` all opt in, while
 * `?benchmark=0` and `?benchmark=false` do not.
 */
export function isBenchmarkRequested(search: string): boolean {
  const value = new URLSearchParams(search).get('benchmark')
  return value !== null && value !== '0' && value !== 'false'
}
