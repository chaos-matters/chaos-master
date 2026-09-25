// Architectural rules for the monorepo. `pnpm arch` reports violations by rule.
//
// The rules that matter here are the two the 2026-07 refactor strategy set out
// to fix: import cycles, and leakage out of the pure @chaos-master/core package.
const path = require('node:path')

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle means neither module can be understood, tested or lazily ' +
        'loaded on its own. Break it with an interface or a shared leaf module.',
      from: {},
      to: { circular: true },
    },
    // The two core rules only work because npm packages stay in the graph as
    // leaves: `doNotFollow` below keeps them, and `exclude` must not name
    // node_modules. Until WP3b (2026-09-23) it did, so every npm target was
    // removed before a rule saw it and `core-stays-pure` could fire only on an
    // import of packages/app (docs/agent/MISTAKES.md, "dependency-cruiser
    // drops npm packages before its rules see them").
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        '@chaos-master/core must stay free of DOM, WebGPU and Solid so it can ' +
        'be tested anywhere and reused off the browser main thread, and must ' +
        'not reach into another workspace package. Solid and the WebGPU ' +
        'types are refused even if core declared them.',
      from: { path: '^packages/core/src' },
      to: { path: '^packages/(?!core/)|solid-js|@webgpu' },
    },
    {
      // Core may import what packages/core/package.json lists under
      // `dependencies` (valibot, structurajs, typegpu), and nothing else.
      // dependency-cruiser reads the package.json closest to the importing
      // file, so for core that is core's own manifest.
      //
      // typegpu is declared, so this rule lets it through; `core-typegpu-frozen`
      // below keeps it to the files that import it today. Whether core should
      // carry it at all is docs/agent/BUGS.md #33.
      name: 'core-declared-deps-only',
      severity: 'error',
      comment:
        'Core imports only its declared runtime dependencies. A dev ' +
        'dependency, a package core does not declare (the root ' +
        'devDependencies hold browser-only ones such as @codemirror/*), a ' +
        'Node built-in, or an import that does not resolve is a dependency ' +
        'core does not have wherever it runs. Declare it, or keep it out of core.',
      from: { path: '^packages/core/src' },
      to: {
        dependencyTypes: [
          'core',
          'npm-dev',
          'npm-no-pkg',
          'npm-unknown',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'unknown',
          'undetermined',
        ],
      },
    },
    {
      // docs/agent/BUGS.md #33: core carries a TypeGPU shader function and
      // pulls typegpu into the Worker's import graph. Until that is settled,
      // typegpu stays in the three core files that import it today (frozen in
      // WP3b, 2026-09-24). A fourth file is an error; the fix for #33 shrinks
      // this list, and nothing should grow it.
      name: 'core-typegpu-frozen',
      severity: 'error',
      comment:
        'typegpu is frozen to math/affineTransform.ts, ' +
        'math/affineTransform3D.ts and utils/schemaUtil.ts in core ' +
        '(docs/agent/BUGS.md #33). Keep new GPU code in the app.',
      from: {
        path: '^packages/core/src',
        pathNot:
          '^packages/core/src/(math/affineTransform|math/affineTransform3D|utils/schemaUtil)\\.ts$',
      },
      to: { path: '(^|/)typegpu(/|$)' },
    },
    {
      // An error, not a warning, since WP2 deleted the last eight orphans
      // (2026-09-23): the count is zero, so a new one is a regression the day
      // it lands. `--output-type err` exits non-zero on errors only, which is
      // what makes the `health` job fail on it.
      //
      // dependency-cruiser's orphan is a module with NO edges at all, neither
      // imports nor importers. A dead file that still imports something is
      // not an orphan by this definition and passes.
      name: 'no-orphans',
      severity: 'error',
      comment:
        'A module that imports nothing and that nothing imports is either ' +
        'dead or a missing wiring. Delete it, or import it where it belongs.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)(vite|vitest|playwright|eslint)\\.config\\.[cm]?[jt]s$',
          '(^|/)vitest\\.setup\\.ts$',
          '(^|/)index\\.tsx?$',
          '\\.(test|spec)\\.[tj]sx?$',
        ],
      },
      to: {},
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys)$' },
    },
  ],
  options: {
    // npm modules are kept as leaves, not dropped: the core rules above need
    // to see them. Build output is excluded by its place in a package, not by
    // a bare `dist`, which would also match every `node_modules/*/dist/` file.
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '^packages/[^/]+/(dist|dist-native|coverage-audit)/|\\.(test|spec)\\.',
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
