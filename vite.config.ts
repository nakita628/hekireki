import { defineConfig } from 'vite-plus'

export default defineConfig({
  // Single source of truth for formatting style. `vp fmt` and `vp check` use this block whether
  // they run here or in `packages/hekireki`, `test` or `example`, as long as no workspace config
  // has a `fmt` block of its own: Vite+ 1.0 does not merge one into the other, so a workspace
  // block, even one with only ignorePatterns, would format that workspace with the defaults.
  // What a workspace leaves alone is named here, from the root.
  //
  // Keep every pattern specific enough that it matches nothing a workspace formats (a broad
  // root-relative pattern such as `packages/**` would exclude every file). `example/generated/**`
  // and test/harness are generator output committed or checked as the generators write it; their
  // bytes come from the generators' own oxfmt pass.
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
    // hono-takibi.config.ts).
    ignorePatterns: [
      'example/generated/**',
      // Generator output and the foreign-toolchain projects the language checks build it in.
      'test/harness/**',
      // What `prisma generate` writes in examples/active-record, committed as the generator has it.
      'examples/active-record/app/**',
      'examples/active-record/config/locales/models/**',
      // What `prisma generate` writes in these, committed as the generator has it.
      'examples/better-auth/*/better-auth.schema.ts',
      'examples/better-auth/*/schema.ts',
      'examples/drizzle-mysql/src/db/schema.ts',
      'examples/drizzle-postgresql/src/db/schema.ts',
      'packages/hekireki/docs/studio-api.md',
      'packages/hekireki/src/studio/client/hooks/index.ts',
      'packages/hekireki/src/studio/client/routeTree.gen.ts',
      'packages/hekireki/src/studio/server/handlers/index.ts',
      'packages/hekireki/src/studio/server/index.ts',
      'packages/hekireki/src/studio/server/routes/index.ts',
    ],
  },
})
