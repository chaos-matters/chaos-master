import tgpu from 'typegpu'

type Wgsl = Parameters<typeof tgpu.resolve>['0']['externals']

export function wgsl(
  strings: TemplateStringsArray,
  ...externalsOrStrings: (Wgsl | string | number)[]
) {
  const externals = []
  const stringParts = []
  for (let i = 0; i < strings.length; ++i) {
    stringParts.push(strings[i])
    if (i < externalsOrStrings.length) {
      const ext = externalsOrStrings[i]
      if (typeof ext === 'object') {
        externals.push(ext)
      } else {
        stringParts.push(ext)
      }
    }
  }
  return tgpu.resolve({
    template: stringParts.join(''),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    externals: Object.assign({}, ...externals),
  })
}
