export const BENCHMARKS_PATH = '/benchmarks'

const BENCHMARK_PATHS = new Set([BENCHMARKS_PATH, `${BENCHMARKS_PATH}/`])

export function isBenchmarksPath(pathname: string): boolean {
  return BENCHMARK_PATHS.has(pathname)
}
