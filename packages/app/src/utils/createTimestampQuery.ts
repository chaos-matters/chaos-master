import { sum } from './sum'

export function createTimestampQuery<T extends string>(
  device: GPUDevice,
  timestampNames: T[],
  avgCount = 5,
) {
  const timestampQuerySet = device.createQuerySet({
    type: 'timestamp',
    count: 8,
  })

  const timestampBuffer = device.createBuffer({
    size: timestampQuerySet.count * BigInt64Array.BYTES_PER_ELEMENT,
    usage:
      GPUBufferUsage.QUERY_RESOLVE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  })

  const timestampMappable = device.createBuffer({
    size: timestampBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const timestampWrites = Object.fromEntries(
    timestampNames.map((name, i) => [
      name,
      {
        querySet: timestampQuerySet,
        beginningOfPassWriteIndex: i * 2,
        endOfPassWriteIndex: i * 2 + 1,
      },
    ]),
  ) as Record<T, GPUComputePassTimestampWrites>

  function clear(encoder: GPUCommandEncoder) {
    encoder.clearBuffer(timestampBuffer)
  }

  function write(encoder: GPUCommandEncoder) {
    encoder.resolveQuerySet(
      timestampQuerySet,
      0,
      timestampQuerySet.count,
      timestampBuffer,
      0,
    )

    if (timestampMappable.mapState === 'unmapped') {
      encoder.copyBufferToBuffer(
        timestampBuffer,
        0,
        timestampMappable,
        0,
        timestampMappable.size,
      )
    }
  }

  const latest: Record<T, number>[] = []

  async function read() {
    if (timestampMappable.mapState !== 'mapped') {
      await timestampMappable.mapAsync(GPUMapMode.READ)
    }
    const times = new BigInt64Array(timestampMappable.getMappedRange())
    const results = Object.fromEntries(
      timestampNames.map((name, i) => [
        name,
        Number(times[i * 2 + 1]! - times[i * 2]!),
      ]),
    ) as Record<T, number>
    timestampMappable.unmap()
    latest.push(results)
    if (latest.length > avgCount) {
      latest.shift()
    }
    return results
  }

  return {
    timestampWrites,
    clear,
    write,
    read,
    get average(): Readonly<Record<T, number>> | undefined {
      const count = latest.length
      if (count < avgCount) {
        return undefined
      }
      return Object.fromEntries(
        timestampNames.map((name) => [
          name,
          sum(latest.map((current) => current[name])) / count,
        ]),
      ) as Readonly<Record<T, number>>
    },
  }
}
