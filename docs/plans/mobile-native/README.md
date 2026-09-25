# Native mobile (Capacitor) plan

Status: **scaffolding in progress**, 2026-09-11. Branch `feat/mobile-capacitor-scaffolding-9224ec`, based on fork `main` at `0d264a2c`. The decisions are recorded in section 8.

The interface this wrapper contains is planned in [`DESIGN.md`](./DESIGN.md) beside this file: the tokens, the bottom rail, the shell, settings, onboarding, the permission moment, export and share, the rename, Play and the phase-2 paywall, each with acceptance criteria per device class and a test plan. Its drawn counterpart is the showcase page `gallery-viewer/lumen-native.html` in the disjoint-colliders repository.

Research behind this plan (maintainer-local, not in the repo): `~/.dotfiles/personal/chaos-master/research/mobile-native-2026-09-11/`

- `index.html`: visual index of current screens, target mockups, concepts and the Mobbin board
- `reports/01-native-build-reference.md`: how MercuryPitch / Beside Cue build and ship Capacitor apps
- `reports/02-chaos-master-port-analysis.md`: compatibility matrix, WebGPU-in-WebView verdict, store policy
- `reports/03-native-ui-research.md`: UI critique, platform guidance, native-feel checklist
- `STORE-OPS-CHECKLIST.md`: accounts, certificates, secrets and the store submission itself. Kept private because it names people and accounts.

Account identifiers, certificate or profile details and secret values never go in this file. Secret **names** are fine.

---

## 1. Goal

Wrap `packages/app` in Capacitor as a bundled, offline-capable iOS/iPadOS and Android app that feels native rather than web-shaped. RevenueCat powers at least one purchase, which also keeps a RevenueCat Shipaton 2026 entry possible. The first milestone is a TestFlight build; it doubles as the WebGPU device probe.

## 2. Verdict in brief

- **The app fits Capacitor well.** It is a client-only SPA. It has no service worker, workers, WASM or `SharedArrayBuffer`, and it routes by fragment. It runs from `capacitor://localhost` (iOS) and `https://localhost` (Android) with no COOP/COEP and no path rewrites.
- **WebGPU inside the WebView is the one gate, and it is unverified on both platforms.**
  - iOS 26 WKWebView: Apple states that WebGPU is on by default.
  - Android System WebView: plausible from WebView 146, on Vulkan-capable Android 12+ devices. Chrome's 121 launch excluded WebView.
  - The first TestFlight build is the probe.
- **Fork `main` has no login and no payments.** Server rendering, auth, Stripe and credits exist only on `feat/server-side-gpu-renderer`. A native v1 with no login and one RevenueCat product avoids App Store guidelines 4.8 (login), 5.1.1(v) (account deletion) and 3.1.1 (credits).
- **The code seams are small:**
  - an API/public origin helper;
  - one save/share port, replacing about 12 `<a download>` copies;
  - lifecycle, back-button and safe-area wiring;
  - Worker CORS;
  - `viewport-fit=cover`;
  - hiding web-only features.
- **The UI needs four structural fixes and a polish pass, not a redesign** (research report 03):
  1. layout routing by input and platform;
  2. a real detented sheet;
  3. editor modes instead of the Advanced Tools drawer;
  4. a real iPad sidebar plus inspector.

## 3. Reference pattern: MercuryPitch `feat/native-v1-1`

| MercuryPitch / Beside Cue does                                                                                                                        | We do                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One shell package per app (`apps/beside-cue`, `apps/mercurypitch`) with committed `ios/` and `android/`                                               | `packages/mobile` (this repo globs only `packages/*`) with committed `ios/` and `android/`                                                                                                                                                            |
| Shared `packages/mobile-runtime`: product-neutral ports (haptics, purchases, paywall, notifications) with `web`, `capacitor/*` and `testing` adapters | `packages/mobile-runtime` with the same shape, plus the platform services MercuryPitch kept elsewhere (save/share, lifecycle, back button, external links, deep links), so there is **one** seam. Two seams would drift apart and never be reconciled |
| The shell's own `vite.config.ts` aliases the web `src`                                                                                                | **One** Vite config in `packages/app` with a `native` mode (`pnpm build:native` writes `dist-native`), and `webDir: '../app/dist-native'` in the shell. Verified: `cap add` and `cap sync` accept the outside `webDir`                                |
| Capacitor 8.5 with SwiftPM (no CocoaPods), so `cap add`/`cap sync` run on Linux                                                                       | Same (Capacitor 8.5.1)                                                                                                                                                                                                                                |
| Reusable `capacitor-app.yml` + thin per-app caller; every secret passed explicitly with an app prefix                                                 | Same: caller `lumen-mobile.yml`, prefix `LUMEN_*`, tags `mobile-v*`                                                                                                                                                                                   |
| Manual iOS signing: team distribution cert in a throwaway keychain; per-app App Store profile read only by the App target                             | Same (`PROVISIONING_PROFILE_SPECIFIER = $(LUMEN_PROFILE)` on the App target's Release configuration); reuse the team certificate, never mint a second one                                                                                             |
| Shared `gradle/signing.gradle` parameterised by env prefix; unsigned release when secrets are absent; fixed debug keystore                            | Same (`packages/mobile/gradle/signing.gradle`, prefix `LUMEN`, debug key `lumen-apeiron-debug.jks`)                                                                                                                                                   |
| `github.run_number` = versionCode / CFBundleVersion; marketing version from the tag                                                                   | Same; marketing version tracks the web app (`0.9.x`)                                                                                                                                                                                                  |
| RevenueCat behind ports, with a build-time purchase policy that fails closed on Test Store keys and missing keys                                      | Same (`purchase-kit` build-policy pattern), in Phase 5                                                                                                                                                                                                |

## 4. Target structure

```
packages/
  app/                  chaos-master: web app + Worker. `native` Vite mode, no Capacitor deps
  core/                 unchanged
  landing/              unchanged; gains /privacy and /support pages (store requirement)
  mobile/               @chaos-master/mobile   Capacitor shell (scaffolded 2026-09-11)
    capacitor.config.ts
    package.json        @capacitor/{core,app,browser,filesystem,haptics,share} + cli/ios/android
    ios/                committed (SPM)
    android/            committed
    gradle/signing.gradle
    assets/             icon-mark.svg, the icon and splash master (the favicon's mark)
    scripts/            generate-icons.sh (`pnpm icons`); dev-cert.sh (todo)
  mobile-runtime/       @chaos-master/mobile-runtime       ports + adapters (files done, the rest todo)
    src/files.ts        save/share: the FilePorts contract and the platform-neutral flow, tested against fakes
    src/capacitor/*     Capacitor adapters (subpath exports)
    (todo)              Platform, Lifecycle, BackButton, Haptics, Purchases, DeepLink, ExternalLink
APP-STORE-EXCEPTION.md  AGPL section 7 additional permission for app-store distribution
```

Web code reaches native behaviour only through a dynamic `import('@chaos-master/mobile-runtime/capacitor')` guarded by the literal `__NATIVE_BUILD__` define in the importing module (`packages/app/src/lib/nativeSave.ts`), so the web bundle never contains Capacitor plugins. The exported `IS_NATIVE` (`packages/app/src/lib/platform.ts`) is fine for branching but not for this: Vite 8's bundler does not fold constants across modules, so an `if (IS_NATIVE)` guard still emits the Capacitor chunk into the web build.

---

## 5. Phases and checklist

### Phase 0: decisions and gates

- [x] Permanent app id: `com.irchiinnuss.lumenapeiron` (2026-09-11). It keys the App ID, Play package, profiles and RevenueCat apps.
- [x] Licence: the copyright holders' consent is reported in place (2026-09-11). The additional permission is published in `APP-STORE-EXCEPTION.md` beside `LICENSE`; the AGPL text itself stays verbatim. Still to do: confirm no third-party (A)GPL code without such a permission is bundled.
- [x] Shipaton: aim for it; go/no-go after the WebGPU probe on the first TestFlight build.
- [x] Apple App ID capabilities: In-App Purchase, Associated Domains, Push Notifications, Sign in with Apple, Increased Memory Limit. No capability _requests_: WebGPU in WKWebView needs no entitlement, and server rendering is our own HTTPS API.

### Phase 1: WebGPU probe (the first TestFlight build)

- [x] iPhone, 2026-09-11: TestFlight 0.9.11 (6) renders and animates the editor, exports go to the share sheet, the microphone asks. Still to run: an iPad (iPadOS 26), and the `adapter.info`, `adapter.limits`, frame-rate and memory readings over Safari Web Inspector.
- [x] Android, 2026-09-11: the debug build on a Galaxy Tab S9+ (Adreno) renders, exports save to Documents/Lumen Apeiron, the microphone asks. Still to run: a Mali device.
- [ ] Watch for GPU-process crashes (reported on iPhone 15 / iOS 26.4 WKWebView), jetsam reloads, the swapchain flicker, and preview-canvas starvation (research found touch-layout screenshots time out under real WebGPU while the desktop layout does not).
- [ ] Optional: a native-only diagnostics readout (adapter info, limits, UA) if the probe needs more than the app's own state.
- [ ] Record the verdict per platform here; Shipaton go/no-go.

### Phase 2: scaffold

- [x] `packages/mobile` with `capacitor.config.ts`:
  - `backgroundColor: '#080A0E'`
  - `server.androidScheme: 'https'`, `cleartext: false`
  - `ios.contentInset: 'never'`, `ios.scrollEnabled: false`, `ios.allowsLinkPreview: false`
  - never a committed `server.url`
- [x] `cap add ios` and `cap add android` on Linux; Capacitor's own `.gitignore` files cover the generated `public/` copies and `capacitor.config.json`.
- [x] iOS project:
  - deployment target 26.0 (project and App target);
  - `ITSAppUsesNonExemptEncryption=false`;
  - `NSMicrophoneUsageDescription` for audio-reactive mode;
  - `NSPhotoLibraryAddUsageDescription`, which the share sheet's Save Image and Save Video need (without it iOS terminates the app);
  - `UIRequiredDeviceCapabilities` = `arm64`;
  - iPhone and iPad (`TARGETED_DEVICE_FAMILY 1,2`, so 13-inch iPad screenshots will be required);
  - Release on the App target: `CODE_SIGN_STYLE Manual`, `Apple Distribution`, `PROVISIONING_PROFILE_SPECIFIER = $(LUMEN_PROFILE)`.
- [x] iOS `PrivacyInfo.xcprivacy`, registered in `project.pbxproj` (a file on disk alone compiles into nothing). It declares the file timestamp reason `C617.1` for `@capacitor/filesystem`; Capacitor and Cordova ship their own manifests.
- [ ] Decide the iPhone orientations deliberately (the template declares portrait and both landscapes); an undesigned orientation is a rejection risk.
- [x] Android project:
  - `minSdk 31`, `targetSdk`/`compileSdk 36`;
  - `uses-feature android.hardware.vulkan.version 0x401000 required`;
  - `RECORD_AUDIO` **and** `MODIFY_AUDIO_SETTINGS` (Capacitor requests both as a batch, so an undeclared one silently fails);
  - `allowBackup=false`;
  - `singleTop` (RevenueCat requires `standard` or `singleTop`);
  - `gradle/signing.gradle` with the `LUMEN` prefix.
- [x] Launcher icons and splash from the favicon mark (`packages/mobile/assets/icon-mark.svg`, `pnpm --filter @chaos-master/mobile icons`):
  - Android: an adaptive icon with a themed (monochrome) layer, and a #080A0E `Theme.SplashScreen` background.
  - iOS: the 1024 opaque icon and the splash.
- [x] `packages/app`:
  - `.env.native` (no secrets): API and public origins = `https://lumenapeiron.com`, empty GA and Turnstile keys, `VITE_COMPUTE_GATE_CAPACITY=1`;
  - `build:native` (`vite build --mode native --outDir dist-native`);
  - the `__NATIVE_BUILD__` define, typed in `src/lib/platform.ts` and set to `false` in `vitest.config.ts`.
- [x] Root scripts: `mobile:build`, `mobile:sync`, `mobile:android`.
- [x] Extend `typecheck` and `test` to cover `packages/mobile-runtime`. `packages/mobile` (only `capacitor.config.ts`) is still not typechecked.
- [x] Ignore files: `dist-native` and signing material (`*.jks`, `*.keystore`, `*.p8`, `*.p12`, `*.mobileprovision`) in `.gitignore`; `packages/mobile/ios` and `packages/mobile/android` in `.prettierignore` and the eslint `ignores`.
- [ ] Scripts:
  - Done: `packages/mobile/scripts/generate-icons.sh` (rsvg-convert and ImageMagick, byte-identical re-runs).
  - Todo: `scripts/dev-cert.sh`, a LAN-IP TLS cert for on-device live reload.
- [ ] `packages/mobile-runtime`: the files port is in (contract, Capacitor adapter, fakes, vitest); the other contracts and adapters are still todo.

### Phase 3: web-app seams (code)

- [x] `src/lib/platform.ts` with `IS_NATIVE`, `apiUrl(path)` and `publicOrigin()`, plus a unit test.
- [ ] Switch these call sites to it:
  - `App.tsx` `/api/shorten` fetch;
  - `lib/homeConfig.ts`;
  - `lib/galleryContent.ts` (fetches and poster `<img>`);
  - `utils/apiClient.ts`;
  - `utils/shareLink.ts` (`location.origin`);
  - the three `/discord` links (`MainWorkspace.tsx`, `HomeTab.tsx`, `HelpModal.tsx`).
- [ ] Worker: a CORS allowlist of `capacitor://localhost` and `https://localhost` on `/api/*`, with `OPTIONS` preflight and `Vary: Origin`; keep the per-IP rate limits. It only takes effect once deployed to lumenapeiron.com, so until then the gallery and share links fail in the app, while the editor works offline.
- [ ] `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, then `appUrlOpen` feeding the existing `?s=` / `?flame=` / `?cv=` decode path.
- [x] Saving files. Every `<a download>` site goes through `utils/blob.ts` `downloadBlob`, which in native builds calls `lib/nativeSave.ts` and the mobile-runtime files port:
  - Android writes to `Documents/Lumen Apeiron`: no permission from Android 11, numbered names like a browser, and a share-sheet fallback. It toasts "Saved … to …" with a Share action.
  - iOS writes to the cache and opens the share sheet.
  - The export tracker's Download link fetches its blob URL and saves the same way.
  - Copy Image (the benchmark card, the logo history) opens the share sheet instead (`shareNative`). In a WebView the image clipboard write resolves on Android but nothing reaches the system clipboard, and Capacitor's Clipboard plugin only copies text.
- [x] Lifecycle: `pause` and `resume` over the `LifecyclePorts` seam (`lib/lifecycle.ts`), where `pause` writes the open document into Recents through the editor's own autosave writer (`lib/pauseSave.ts`) — native only, and only when something unsaved has actually changed, so the next launch finds the work in the Library with nothing to restore. A pause that storage refused is reported at the next launch, since a toast raised as the process ends is never read. The single-slot draft this started as (`chaos-master-draft`) is read once on launch and retired. There is no `appActive` signal: it was deliberately not ANDed into the `createAnimationFrame` accessors (both platforms suspend `requestAnimationFrame` for a hidden WebView, and `finalRenderInterval` already parks the loop, so it would have been a second brake on a stopped wheel), which left it with no reader at all, so it has been removed rather than ticked. Ancestry flushing and export checkpoints are still open.
- [x] Android back button: closes the top modal, sheet, drawer, popover or destination, else `minimizeApp()`. The registry is `lib/backStack.ts`: every layer pushes its own handler while it is open, so the pop order is the order things opened and nothing inspects the DOM. Not yet covered: the Arcade's own panels register nothing, so back from inside an Arcade mode leaves the Arcade rather than closing the panel first.
- [x] `index.html` viewport: `viewport-fit=cover`, so `env(safe-area-inset-*)` is no longer 0 on iOS. Consider `interactive-widget=resizes-content` with the keyboard work.
- [x] Android system bars: `src/index.tsx` drops `viewport-fit=cover` on native Android before DOMContentLoaded, when SystemBars reads it. SystemBars then pads the WebView between the status and navigation bars instead of passing the insets to a layout that does not pad for them. The bars show the theme's `windowBackground` (--void) with light icons (SystemBars `style: 'DARK'`).
- [ ] Safe-area CSS, now for iOS only (`contentInset: 'never'` with `viewport-fit=cover`): check that every top-anchored control clears the iPad status bar with `env(safe-area-inset-top)`; `100dvh` instead of `100vh`.
- [ ] Self-host Inter (`@fontsource-variable/inter`) and drop the Google Fonts `@import` (the offline story).
- [ ] Hide in native: Discord share and Turnstile, `getDisplayMedia` replay video, the `/benchmarks` path entry, "try Chrome/Firefox/Safari" copy.
- [ ] Native-aware unsupported copy in `ErrorHandling.tsx` and `PreviewPoster.tsx` ("requires iOS 26"; "update Android System WebView" with a runtime `Chrome/<major>` check below 146; "this GPU is not supported") and a "Restart renderer" action.
- [ ] Storage: `localStorage` and IndexedDB are evictable in a WebView. Move the entitlement cache and the custom variation library to `@capacitor/preferences` or keep them derivable, call `navigator.storage.persist()`, and promote the Backup ZIP.
- [ ] CI keeps web builds honest: `node.js.yml` also runs `pnpm --filter chaos-master build:native`.

### Phase 4: native feel (UI)

P0 before any store release:

- [ ] **Layout routing.** `workspaceLayoutStore.ts` should decide touch versus desktop from `(pointer: coarse)` or `IS_NATIVE`, respecting `touchLayoutPreference`. Width only chooses _compact_ (below about 700 px, the phone sheet) versus _regular_ (iPad sidebar plus inspector). Remove the three duplicated breakpoint sources, and handle landscape phones, which currently classify as tablet.
- [ ] **Detented sheet.** `MobileBottomSurface` stays mounted and moves with `translateY`. Detents: peek, medium and large. Drag with velocity and a spring, a haptic on each snap, and the canvas interactive at peek and medium.
- [ ] **Shell basics.** Hit targets of 44 pt or more (`.hudButton` is 34 px); remove the hamburger that overlaps `TouchHUD`; move "delete transform" into a long-press menu with an undo toast.
- [ ] **Touch-layout GPU budget.** Cap concurrent `variationsCarousel` preview canvases (4 on phone), pause them during slider drags and at peek, and stop everything on `pause`.

P1 at or just after launch:

- [ ] Replace `AdvancedToolsDrawer` with editor modes (Edit / Animate / Audio / Render); Arena, Breed, Art Director and Gallery move to the Library home; "Switch to desktop layout" moves to Settings.
- [ ] Tablet: a landscape layers sidebar plus a trailing inspector; a portrait bottom-docked two-column inspector plus keyframe strip; a rail in Split View; delete or reuse the unused `TabletSplitLayout.tsx`.
- [ ] Brand tokens (`--void`, `--graphite`, `--ember`, `--solar`, `--cyan`) in `styles/designSystem/colors.css`, replacing the slate/sky literals in `TouchSurface.module.css`; one glass token set with opaque fallbacks; the system font stack for chrome in native; "Untitled flame" as the fallback name.
- [ ] Instrument-grade sliders (tap to type, fine scrub, double-tap reset, haptic ticks, centred signed sliders) and canvas gestures (pinch, two-finger pan and rotate, double-tap reset, a 20 pt edge zone).

P2 afterwards: the variation library as the large detent, a palette sheet using the system colour picker, a phone keyframe strip, a one-screen first run, copy fixes and accessibility (see research report 03, section 4).

### Phase 5: purchases (RevenueCat)

- [ ] `@revenuecat/purchases-capacitor` and `-ui` `^13.5.1`, behind `PurchasesPort` and `PaywallPort`. Configure once, guarded by `isConfigured()`; map error codes; treat cancelled and pending as outcomes, not errors.
- [ ] Build-time purchase policy (fail closed): no `test_` key and no Test Store in distribution builds; release tags require the store purchase mode and the correct platform key; mock purchases only in `testflight-internal`.
- [ ] v1 product: one non-consumable "Pro" with local-only unlocks (contents: section 8, decision 6), a visible **Restore Purchases**, and the entitlement read from `getCustomerInfo()`.
- [ ] Paywall: RevenueCat Paywall v2 in the brand look (research report 03, mockup 3), with price and period always beside the CTA (App Store 3.1.2).
- [ ] Later, with server rendering on `main`: credit packs as consumables or virtual currency and tiers as subscriptions, with the Worker ledger as the source of truth via RevenueCat webhooks; Stripe stays web-only.

### Phase 6: CI/CD

- [x] `.github/workflows/capacitor-app.yml` (reusable, ported from MercuryPitch; purchase plumbing removed, with `PURCHASES` markers where it returns) and the caller `.github/workflows/lumen-mobile.yml` (2026-09-11; not yet run on GitHub). The fork is **private**, so macOS minutes are metered:
  - PRs: Android tests/lint/debug APK; an iOS simulator build only when `packages/mobile/`, `packages/mobile-runtime/` or the workflows change; nothing signed.
  - Push to main: Android only.
  - `mobile-v*` tag: Android release AAB/APK, plus a signed iOS archive uploaded to TestFlight. The ad-hoc IPA is exported but never uploaded, because a public artifact would carry the holder's name and the registered device UDIDs.
  - Manual run on a branch: a signed archive without upload (proves the certificate and profile).
  - Missing secrets skip jobs instead of failing them. `gh variable set LUMEN_IOS_CI --body off` stops every macOS job without a commit.
- [x] The lessons are kept: no `paths:` filter on tag triggers (a `changes` job instead); `cancel-in-progress` only for PRs; SwiftPM via `-clonedSourcePackagesDirPath $RUNNER_TEMP/spm`; a throwaway keychain; manual signing through `LUMEN_PROFILE`; build number = `github.run_number`; the marketing version from the tag, else `packages/app/package.json`.
- [ ] First runs: a PR touching `packages/mobile/`, then (after the secrets are pushed) a manual run on the branch, then the tag `mobile-v0.9.11`.
- [ ] Later: build `dist-native` once on ubuntu and hand it to the macOS jobs (saves one to two billed macOS minutes per iOS job); bump the Node 20-era actions (`setup-java@v4`, `upload-artifact@v4`, `setup-android@v3`).
- [ ] Secrets by name, mapped explicitly by the caller (never `secrets: inherit`):
  - Team: `APPLE_TEAM_ID`, `APPLE_ASC_KEY_ID`, `APPLE_ASC_ISSUER_ID`, `APPLE_ASC_KEY_P8`, `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`.
  - App iOS: `LUMEN_APPSTORE_PROFILE_BASE64`, `LUMEN_APPSTORE_PROFILE_NAME`, `LUMEN_ADHOC_PROFILE_BASE64`, `LUMEN_ADHOC_PROFILE_NAME`.
  - App Android: `LUMEN_KEYSTORE_BASE64`, `LUMEN_KEYSTORE_PASSWORD`, `LUMEN_KEY_ALIAS`, `LUMEN_KEY_PASSWORD`, `LUMEN_DEBUG_KEYSTORE_BASE64`.
  - RevenueCat (Phase 5): `LUMEN_REVENUECAT_IOS_KEY`, `LUMEN_REVENUECAT_ANDROID_KEY`.

### Phase 7: store readiness

- [ ] `packages/landing`: `/privacy/` and `/support/` pages, with trailing-slash URLs (a redirect confuses reviewers). Add contact info to About.
- [ ] A "Report this flame" action on content opened from share links, plus a Worker hide-list (App Store 1.2).
- [ ] Keep `?cv=` custom WGSL import behind the allowlist compiler, with a native kill-switch ready (App Store 2.5.2).
- [ ] Mitigate App Store 4.2 (minimum functionality): offline, on-device rendering; native share and save; haptics; Universal Links; a native paywall; review notes that say all of this.
- [ ] Assets: a 1024 opaque icon; iPhone 6.9-inch screenshots (1320x2868) and a 13-inch iPad set (2064x2752); a 1024x500 feature graphic for Play; for Shipaton, a bare 1179x2556 screenshot and a demo video under 2 minutes.
- [ ] Accounts, certificates, the RevenueCat dashboard and the submission steps are in the private `STORE-OPS-CHECKLIST.md`.

### Phase 8: after v1

- [ ] Android store release, once the probe passes (the Play organisation account has no closed-test gate).
- [ ] Login: Sign in with Apple, native Google (`@capgo/capacitor-social-login`; Google blocks OAuth in embedded WebViews) and email, plus in-app account deletion. Only when server rendering ships.
- [ ] Server-render credits through RevenueCat (Phase 5).
- [ ] Notifications for finished renders, keep-awake during long renders, and an `AVAudioSession` category if audio must play with the silent switch on.

---

## 6. First TestFlight build: runbook

Steps marked **(you)** need the Apple account or the vault; the rest is in the repo.

1. [x] App ID `com.irchiinnuss.lumenapeiron` registered with the capabilities in Phase 0 (2026-09-11).
2. [~] App Store Connect app record: name "Lumen Apeiron", bundle id above. Internal TestFlight needs no screenshots, review or privacy label.
3. [x] Two profiles against the existing team distribution certificate (2026-09-11): App Store `lumenapeiron-appstore` and Ad Hoc `lumenapeiron-beta`. Both expire with the certificate, so renew them together.
4. [x] The profiles are in the maintainer's vault. A maintainer-local env template references them plus the six team `APPLE_*` items. **(you)** Push them to this fork's Actions secrets with `gh-sync.sh`, because GitHub secrets are per repository.
5. Push the branch to the fork, then push a tag `mobile-v0.9.11` on the commit to build. The workflow archives, signs and uploads to TestFlight; the build number is the run number.
6. **(you)** In TestFlight, add yourself as an internal tester and install on the iPhone and iPad. Run the Phase 1 probe.

## 7. Lessons carried over (do / don't)

- **Do** prefix every per-app secret and tag from day one (`LUMEN_*`, `mobile-v*`). Generic `APPLE_PROVISIONING_PROFILE_*` names nearly signed one app with another app's profile.
- **Do** use manual signing. Automatic signing hit the certificate limit, and cloud-managed signing fails with an App Manager API key.
- **Do** name Apple profiles App Store versus **Ad Hoc** (ad-hoc signs with the distribution certificate; no development profile is needed).
- **Do** export `.p12` files with `openssl pkcs12 -export -legacy`. The OpenSSL 3 default is refused by the macOS keychain, and CI does not say why.
- **Do** keep one fixed debug keystore, so CI and local APKs can update each other without an uninstall that wipes on-device data.
- **Do** treat `fetch` status 0 with a body as success for bundled media on iOS. The `capacitor://` handler answers range-less media requests that way.
- **Do** compile GPU pipelines at init and run animation on wall-clock time, so the first draw does not stutter and animation keeps its speed under low fps on iPhone.
- **Don't** re-apply the audio session category or the speaker override on every route change. Each one posts another route change, and the loop makes audio and the UI stutter. Override only when the route really is the built-in receiver, behind a reentrancy guard.
- **Don't** treat a relative asset base (`base: './'`) as a Capacitor requirement. Capacitor serves `webDir` at the origin root on both platforms.
- **Don't** keep plaintext signing material in a directory. The vault is the only source of truth.

## 8. Risks and decisions

### Risks

1. **Licence.** AGPL-3.0-only with more than one copyright holder. Consent is reported in place and the additional permission is published (`APP-STORE-EXCEPTION.md`). Remaining: confirm no third-party (A)GPL code without such a permission is bundled.
2. **WebGPU in the WebView** may fail or crash on some devices even where it is advertised. Mitigations: the Phase 1 probe, store gating (iOS 26 target; Android minSdk 31 plus the Vulkan filter) and the degraded shell.
3. **App Store 4.2 (web wrapper).** Moderate risk, because lumenapeiron.com is the same app. Mitigate with the list in Phase 7.
4. **Shipaton timing.** The deadline is 2026-09-30 11:45 PM PT, and the app must be live, not in review. A new App Store record, the first IAP reviewed together with the first version, and a possible 4.2 rejection round all compete for the remaining time.
5. **macOS CI minutes** on a private fork: tags-only uploads keep them down.
6. **Memory pressure on iOS.** A web-content process kill reloads the WebView. Autosave on `pause` and lower native budgets are the mitigation.

### Decisions

| #   | Decision                                             | Outcome                                                                                                                                                              |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App id (permanent)                                   | **Decided 2026-09-11:** `com.irchiinnuss.lumenapeiron`                                                                                                               |
| 2   | Store name / subtitle                                | Proposed: "Lumen Apeiron" / "Fractal Flame Studio"; "Chaos Master" stays the in-app sub-brand                                                                        |
| 3   | Publisher account                                    | The existing Apple team; the Play organisation account (D-U-N-S verified, so no closed-test gate)                                                                    |
| 4   | Platform order                                       | **Decided 2026-09-11:** iOS/iPadOS first, starting with a TestFlight build (target 26.0); the Android structure is scaffolded alongside                              |
| 5   | Shipaton                                             | **Decided 2026-09-11:** aim for it; go/no-go after the WebGPU probe on the first TestFlight build (target: live about 2026-09-23)                                    |
| 6   | Pro contents                                         | Proposed: non-consumable Pro with high-res/4x export and long/high-bitrate MP4. Alternatives: a subscription (more paywall and terms work) or a tip jar (weak story) |
| 7   | Login in native v1                                   | Proposed: none; Sign in with Apple plus native Google later, with the server-render branch                                                                           |
| 8   | macOS CI                                             | **Decided 2026-09-11:** GitHub Actions on the private fork; PRs never upload; TestFlight uploads from `mobile-v*` tags                                               |
| 9   | Version numbering                                    | Proposed: store version tracks the web app (`0.9.x`); build number = run number                                                                                      |
| 10  | Discord share, replay video, `/benchmarks` in native | Proposed: hidden                                                                                                                                                     |
