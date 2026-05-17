export { version as VERSION } from '@/../package.json'
declare const __COMMIT_HASH__: string
export const COMMIT_HASH =
  typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'
