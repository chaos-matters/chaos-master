import type { CapacitorConfig } from '@capacitor/cli'

// Lumen Apeiron, the native shell around packages/app.
//
// `appId` is permanent: it is the iOS bundle identifier, the Android package
// name, and the key every provisioning profile and RevenueCat app hangs off.
// Neither store lets it change after the first upload. Decided 2026-09-11
// (docs/plans/mobile-native/README.md, decision 1).
//
// `webDir` is the web app's native build (`pnpm --filter chaos-master
// build:native`), so there is one Vite config and one source tree; this
// package only wraps the output.
//
// `androidScheme: 'https'` keeps Android on a secure origin (WebGPU and
// getUserMedia both require one) and `cleartext: false` refuses plain http.
// iOS serves from capacitor://localhost, which is also a secure context.
const config: CapacitorConfig = {
  appId: 'com.irchiinnuss.lumenapeiron',
  appName: 'Lumen Apeiron',
  webDir: '../app/dist-native',
  // index.html's theme-color (the brand --void), so a cold start never
  // flashes white behind the WebView.
  backgroundColor: '#080A0E',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  ios: {
    // The layout pads itself with env(safe-area-inset-*) (viewport-fit=cover
    // in index.html); the WebView must not add its own insets on top.
    contentInset: 'never',
    // The app scrolls its own regions; the WebView itself never rubber-bands.
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SystemBars: {
      // Light status and navigation bar icons (Android): the app is dark in
      // either system theme. The bars sit on the theme's windowBackground,
      // the same --void (res/values/styles.xml).
      style: 'DARK',
    },
  },
  experimental: {
    ios: {
      spm: {
        // `cap sync` writes CapApp-SPM/Package.swift with `.iOS(.v26)`, read
        // from IPHONEOS_DEPLOYMENT_TARGET (26.0, the first iOS with WebGPU in
        // WKWebView). PackageDescription only has `.v26` from tools version
        // 6.2, so the 5.9 default fails package resolution in Xcode with
        // "'v26' is unavailable".
        swiftToolsVersion: '6.2',
      },
    },
  },
}

export default config
