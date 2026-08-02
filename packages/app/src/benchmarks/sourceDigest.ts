/**
 * Stable non-cryptographic identity for benchmarked source code.
 *
 * The compiler contract is part of the input: identical text compiled under a
 * different lowering/schema version is a different implementation.
 */
export function benchmarkSourceDigest(
  source: string,
  compilerId: string,
): string {
  const normalized = `${compilerId.trim()}\n${source
    .replace(/\r\n?/g, '\n')
    .trim()}`
  let first = 0x811c_9dc5
  let second = 0x9e37_79b9
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized.charCodeAt(index)
    first = Math.imul(first ^ character, 0x0100_0193)
    second = Math.imul(second ^ character, 0x85eb_ca6b)
  }
  return `cm-custom-source-v1:${(first >>> 0)
    .toString(16)
    .padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}
