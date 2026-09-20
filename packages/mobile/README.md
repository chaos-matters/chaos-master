# @chaos-master/mobile

The Capacitor shell that ships the Lumen Apeiron web app (`packages/app`) as an
iOS/iPadOS and Android app. It owns no app source. It wraps the output of
`pnpm --filter chaos-master build:native` (`packages/app/dist-native`, the `webDir`
in `capacitor.config.ts`).

Plan, decisions and checklist: [docs/plans/mobile-native/README.md](../../docs/plans/mobile-native/README.md).

## Layout

| Path                    | What it is                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `capacitor.config.ts`   | App id `com.irchiinnuss.lumenapeiron` (permanent), name, `webDir`, WebView options                                          |
| `ios/`                  | Xcode project (Swift Package Manager, no CocoaPods). Deployment target iOS 26.0, the first release with WebGPU in WKWebView |
| `android/`              | Gradle project. `minSdk 31` plus a Vulkan 1.1 `uses-feature` filter (WebGPU in Android System WebView)                      |
| `gradle/signing.gradle` | Android release and debug signing, driven by `LUMEN_*` environment variables                                                |

Generated files that are never committed: `ios/App/App/public`,
`android/app/src/main/assets/public`, and both `capacitor.config.json` copies.
Capacitor's own `ios/.gitignore` and `android/.gitignore` cover them. Also never
hand-edit `ios/App/CapApp-SPM/Package.swift`, which `cap sync` regenerates.

## Commands

```sh
pnpm mobile:build                                   # native web bundle -> packages/app/dist-native
pnpm mobile:sync                                    # build + cap sync (both platforms)
pnpm --filter @chaos-master/mobile sync:ios         # build + cap sync ios
pnpm mobile:android                                 # build + sync + run on a connected device
```

- **Local Android builds need JDK 21.** A newer JDK fails inside Gradle even when
  `./gradlew --version` passes. They also need `ANDROID_HOME` pointing at an SDK with
  platform 36.
- **iOS builds run in CI** on GitHub Actions macOS runners, because this project needs no
  Mac. See `.github/workflows/lumen-mobile.yml`. Release signing is manual: the App
  target reads the profile name from the `LUMEN_PROFILE` build setting, which CI passes
  to `xcodebuild`.

## Signing inputs (names only)

- iOS, per team: `APPLE_TEAM_ID`, `APPLE_ASC_KEY_ID`, `APPLE_ASC_ISSUER_ID`,
  `APPLE_ASC_KEY_P8`, `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`.
- iOS, per app: `LUMEN_APPSTORE_PROFILE_BASE64`, `LUMEN_APPSTORE_PROFILE_NAME`,
  `LUMEN_ADHOC_PROFILE_BASE64`, `LUMEN_ADHOC_PROFILE_NAME`.
- Android: `LUMEN_KEYSTORE_BASE64`, `LUMEN_KEYSTORE_PASSWORD`, `LUMEN_KEY_ALIAS`,
  `LUMEN_KEY_PASSWORD`, `LUMEN_DEBUG_KEYSTORE_BASE64`. CI decodes them to files and
  exports `LUMEN_KEYSTORE_FILE` and `LUMEN_DEBUG_KEYSTORE_FILE` for Gradle.

## Rules

- Never commit `server.url` in `capacitor.config.ts`. It turns the app into a remote
  website. Use it only in a local, uncommitted override for live reload.
- Web code must not import Capacitor plugins statically. Branch on `IS_NATIVE`
  (`packages/app/src/lib/platform.ts`) and `await import()` native modules, so the
  web bundle never carries them.
- Run `pnpm install` before `cap sync`, since `Package.swift` points into the pnpm store.
