const { floor, log, pow } = Math

/**
 * Pretty print file sizes in bytes, kilobytes, megabytes ... yottabytes
 * Adjusted for typescript from https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
 */
export function formatBytes(
  bytes: number,
  { decimals = 2 }: { decimals?: number } = {},
) {
  if (bytes < 0) {
    throw new Error(`Expected a positive number for 'bytes', got ${bytes}.`)
  }
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = floor(log(bytes) / log(k))
  return `${parseFloat((bytes / pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}
