import { tgpu } from 'typegpu'

export function wgsl(
  strings: TemplateStringsArray,
  ...externalsOrStrings: (object | string | number)[]
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

    externals: Object.assign({}, ...externals),
  })
}
