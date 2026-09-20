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
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        '@chaos-master/core must stay free of DOM, WebGPU and Solid so it can ' +
        'be tested anywhere and reused off the browser main thread.',
      from: { path: '^packages/core/src' },
      to: { path: '(^packages/app|solid-js|typegpu|@webgpu)' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'A module nothing imports is either dead or a missing wiring.',
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
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(node_modules|dist|coverage-audit|\\.test\\.|\\.spec\\.)',
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
