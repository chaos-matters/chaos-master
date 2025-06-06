export function createTimestampQuery<T extends string>(
  device: GPUDevice,
  timestampNames: T[],
) {
  const timestampQuerySet = device.createQuerySet({
    type: 'timestamp',
    count: 8,
  })

  const timestampBuffer = device.createBuffer({
    size: timestampQuerySet.count * BigInt64Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
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

  async function read() {
    await timestampMappable.mapAsync(GPUMapMode.READ)
    const times = new BigInt64Array(timestampMappable.getMappedRange())
    const results = Object.fromEntries(
      timestampNames.map((name, i) => [
        name,
        Number(times[i * 2 + 1]! - times[i * 2]!),
      ]),
    ) as Record<T, number>
    timestampMappable.unmap()
    return results
  }

  return {
    timestampWrites,
    write,
    read,
  }
}
