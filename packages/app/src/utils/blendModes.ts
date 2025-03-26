export const premultipliedAlphaBlend = {
  color: {
    operation: 'add',
    srcFactor: 'one',
    dstFactor: 'one-minus-src-alpha',
  },
  alpha: {
    operation: 'add',
    srcFactor: 'one',
    dstFactor: 'one-minus-src-alpha',
  },
} satisfies GPUBlendState

export const alphaBlend = {
  color: {
    operation: 'add',
    srcFactor: 'src-alpha',
    dstFactor: 'one-minus-src-alpha',
  },
  alpha: {
    operation: 'add',
    srcFactor: 'one',
    dstFactor: 'one',
  },
} satisfies GPUBlendState
