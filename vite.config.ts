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
    sortImports: {},
    // Tailwind classes are sorted the way prettier-plugin-tailwindcss would, against the Studio
    // stylesheet (Tailwind v4 reads the theme from CSS). Only the root `fmt` block reaches oxfmt
    // in a workspace, so the option lives here rather than in packages/hekireki.
    sortTailwindcss: { stylesheet: './packages/hekireki/src/studio/client/styles.css' },
    // hono-takibi output in packages/hekireki (formatted by the generator itself; see its
    // hono-takibi.config.ts). Workspace-level `fmt.ignorePatterns` never reach oxfmt.
    ignorePatterns: [
      'example/generated/**',
      'packages/hekireki/docs/studio-api.md',
      'packages/hekireki/src/studio/client/hooks/index.ts',
      'packages/hekireki/src/studio/client/routeTree.gen.ts',
      'packages/hekireki/src/studio/server/handlers/index.ts',
      'packages/hekireki/src/studio/server/index.ts',
      'packages/hekireki/src/studio/server/routes/index.ts',
    ],
  },
})
