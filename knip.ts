import type { KnipConfig } from 'knip'

// Knip (https://knip.dev) reports the files, exports and dependencies nothing reaches. `pnpm
// lint:knip` runs it over the workspaces below, and `pnpm lint` and the Lint workflow with it.
//
// A finding is fixed where it is found: the export keyword goes, the file is deleted, the
// dependency leaves package.json. What is listed here is only what Knip cannot see from the
// imports, each with its reason. A list that no longer matches anything is reported as a
// configuration hint, which the script treats as an error, so an exception does not outlive
// its reason.

const config: KnipConfig = {
  // The toolchains of the other languages the lang tests run the generated code in. They are
  // installed on the machine, not from npm, and a test skips when one is missing.
  ignoreBinaries: [
    'atlas',
    'composer',
    'elixir',
    'go',
    'gofmt',
    'gradle',
    'mix',
    'php',
    'ruby',
    'rustfmt',
  ],
  // Each example is a project of its own, run by hand with `pnpm run demo`: what it imports is
  // mostly the Prisma Client and the code `prisma generate` writes, neither of which is
  // committed, and its dependencies are there for that generated code and for a toolchain of
  // another language. Knip would report on a fresh checkout what it does not report after a demo.
  ignoreWorkspaces: ['examples/*'],
  workspaces: {
    '.': {
      // e2e.yml runs `vp exec playwright` with packages/hekireki as its working directory, where
      // @playwright/test is a devDependency.
      ignoreBinaries: ['playwright'],
      ignoreDependencies: [
        // Studio and `hekireki seed` import a project's own driver and adapter by name at run
        // time (src/database/driver.ts, src/constants/database.ts); the tests link these into the
        // throwaway projects they run against.
        '@libsql/client',
        '@prisma/adapter-better-sqlite3',
        '@prisma/adapter-libsql',
        '@prisma/adapter-mariadb',
        '@prisma/adapter-pg',
        '@prisma/client',
      ],
    },
    'packages/hekireki': {
      // index.ts, the bins and the tests come from package.json and vite.config.ts. The rest is
      // the Studio client, which Vite reaches through index.html, the config hono-takibi reads
      // and the schemas the end-to-end tests copy into their workspace.
      entry: ['src/studio/client/main.tsx', 'hono-takibi.config.ts', 'e2e/fixtures/**/*.prisma'],
      // lint/*.d.ts are the declarations of the lint plugins beside them, read by the type
      // checker and imported by nothing.
      project: ['src/**/*.{ts,tsx,css}', 'e2e/**/*.{ts,prisma}', 'lint/**/*.{js,test.ts}'],
      'vite-plus': { config: ['vite.config.ts', 'vite.studio.config.ts'] },
      // The Migrate page is not shipped for now: its route is commented out (see
      // vite.config.ts and playwright.config.ts). Delete these two lines when the page comes back.
      ignore: ['src/studio/client/features/migrate/**', 'src/studio/client/routes/migrate.tsx'],
      ignoreDependencies: [
        // test/lang runs these from this package's node_modules: `prisma` and `drizzle-kit` by
        // the path of their bin, drizzle-orm and kysely through the node_modules link
        // lang/setup.ts gives the two TypeScript harnesses.
        'drizzle-kit',
        'drizzle-orm',
        'kysely',
        'prisma',
        // main.tsx augments its `Register` interface (`declare module`), which is not an import.
        '@tanstack/router-core',
        // main.tsp imports these, and hono-takibi compiles it with the compiler; Knip does not
        // read TypeSpec. lint/typespec.mjs holds the four to one version.
        '@typespec/compiler',
        '@typespec/http',
        '@typespec/openapi',
        '@typespec/openapi3',
      ],
      ignoreIssues: {
        // Generator output (hono-takibi, the TanStack Router plugin): every schema, hook and
        // route type is exported whether the app uses it or not.
        'src/studio/server/routes/index.ts': ['exports', 'types'],
        'src/studio/client/hooks/index.ts': ['exports', 'types'],
        'src/studio/client/routeTree.gen.ts': ['exports', 'types'],
        // EDGE_OFFSET is GRID by value and a different length by meaning.
        'src/constants/diagram.ts': ['duplicates'],
      },
    },
    test: {
      // harness/** is generator output and the projects of the other toolchains.
      project: ['{lang,db}/**/*.ts'],
    },
    example: {
      // generated/** is generator output, committed to be read.
      project: ['*.{ts,mjs}'],
      entry: ['hekireki.config.ts'],
    },
  },
}

export default config
