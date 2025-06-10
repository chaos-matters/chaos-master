import { sum } from './sum'

export function createTimestampQuery<T extends string>(
  device: GPUDevice,
  timestampNames: T[],
  avgCount = 5,
  /**
   * Each timestamp pair can be written into N different locations,
   * changing location each frame. This seems to help with preventing
   * a race condition while reading the timestamps.
   */
  pairLocationCount = 32,
) {
  const timestampCount = timestampNames.length

  const timestampQuerySet = device.createQuerySet({
    type: 'timestamp',
    count: timestampCount * 2 * pairLocationCount * 2,
  })

  const timestampBuffer = device.createBuffer({
    size: timestampQuerySet.count * BigInt64Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  })

  const timestampMappable = device.createBuffer({
    size: timestampBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  function timestampWrites(frameId: number) {
    const locationIndex = (frameId % pairLocationCount) * timestampCount * 2
    return Object.fromEntries(
      timestampNames.map((name, i) => [
        name,
        {
          querySet: timestampQuerySet,
          beginningOfPassWriteIndex: locationIndex + i * 2,
          endOfPassWriteIndex: locationIndex + i * 2 + 1,
        },
      ]),
    ) as Record<T, GPUComputePassTimestampWrites>
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

  async function read(frameId: number) {
    if (timestampMappable.mapState !== 'unmapped') {
      return
    }
    const locationIndex = (frameId % pairLocationCount) * timestampCount * 2
    await timestampMappable.mapAsync(GPUMapMode.READ)
    const times = new BigInt64Array(timestampMappable.getMappedRange())
    const results = Object.fromEntries(
      timestampNames.map((name, i) => [
        name,
        Number(
          times[locationIndex + i * 2 + 1]! - times[locationIndex + i * 2]!,
        ),
      ]),
    ) as Record<T, number>
    timestampMappable.unmap()
    latest.push(results)
    if (latest.length > avgCount) {
      latest.shift()
    }
  }

  function average(): Readonly<Record<T, number>> | undefined {
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
  }

  return {
    timestampWrites,
    write,
    read,
    average,
  }
}
