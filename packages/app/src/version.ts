import { version } from '@/../package.json'

declare const __GIT_SHA__: string
declare const __NATIVE_BUILD__: boolean

export const VERSION: string = version
export const GIT_SHA: string = __GIT_SHA__

/**
 * The CI run that built this bundle, '' outside CI. It is the TestFlight
 * build number and the `-ci.N` of an Android debug versionName, so a tester
 * can match what the app says to a run on GitHub.
 */
export const BUILD_NUMBER: string = (() => {
  const value: unknown = import.meta.env.VITE_BUILD_NUMBER
  return typeof value === 'string' ? value.trim() : ''
})()

/**
 * The version the app shows. The web shows the release version. A native
 * build appends the CI run and the commit (`0.9.11-ci.6+d9f35cc`), so a
 * tester can tell which build is installed without leaving the app.
 */
export const DISPLAY_VERSION: string =
  __NATIVE_BUILD__ || BUILD_NUMBER !== ''
    ? `${VERSION}${BUILD_NUMBER === '' ? '' : `-ci.${BUILD_NUMBER}`}+${GIT_SHA}`
    : VERSION
