import { vec4u } from 'typegpu/data'

const { crypto } = globalThis

export function randomVec4u() {
  const [x, y, z, w] = crypto.getRandomValues(new Uint32Array(4))
  return vec4u(x!, y!, z!, w!)
}
