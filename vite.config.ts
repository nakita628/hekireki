import { defineConfig } from 'vite-plus'

export default defineConfig({
  // Single source of truth for formatting style. Vite+ merges this root config into every
  // workspace config, so `packages/hekireki`, `test` and `example` inherit these options and
  // only declare what is specific to them.
  //
  // `fmt.ignorePatterns` is inherited too, so keep every pattern here specific enough that it
  // matches nothing inside a workspace (a broad root-relative pattern such as `packages/**`
  // makes the workspaces' own `vp check` exclude every file). `example/generated/**` is
  // generator output committed for review; its bytes come from the generators' own oxfmt pass.
  fmt: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
    sortPackageJson: true,
    experimentalSortImports: {},
    ignorePatterns: ['example/generated/**'],
  },
})
