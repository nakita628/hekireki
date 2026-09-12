import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vite-plus/test'

const root = resolve(import.meta.dirname, '..', '..')
const harness = resolve(import.meta.dirname, '..', 'harness', 'efcore')
const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }
const hasDotnet = spawnSync('dotnet', ['--version'], { stdio: 'ignore', env }).status === 0
// The server the database checks create their databases on: a connection string without a
// database, e.g. `Host=localhost;Username=postgres;Password=postgres`.
const hasPostgres = process.env.HEKIREKI_EFCORE_PG !== undefined

// `main` is what Hekireki-EFCore writes for test/prisma/schema.prisma, `edge` for
// test/prisma/efcore.prisma.
const SCHEMAS = [
  ['main', 'schema.prisma'],
  ['edge', 'efcore.prisma'],
] as const

function dotnet(args: readonly string[], stdout: 'inherit' | 'ignore' = 'inherit') {
  return spawnSync('dotnet', args, { cwd: harness, stdio: ['ignore', stdout, 'inherit'], env })
    .status
}

describe('efcore', () => {
  // Skipping keeps `vp test` runnable without .NET or PostgreSQL; a CI leg that silently skipped
  // would be a false green.
  it.runIf(!!process.env.CI)('the .NET SDK and a PostgreSQL server are available', () => {
    expect({ dotnet: hasDotnet, postgres: hasPostgres }).toStrictEqual({
      dotnet: true,
      postgres: true,
    })
  })

  beforeAll(() => {
    if (!hasDotnet) return
    // Prisma Migrate's own DDL for each schema, which the database checks compare the EF Core
    // model against. `migrate diff` wants a datasource URL even from an empty database; it never
    // connects to it.
    const config = mkdtempSync(join(tmpdir(), 'hekireki-efcore-'))
    for (const [name, file] of SCHEMAS) {
      const schema = join(root, 'test/prisma', file)
      const configFile = join(config, `${name}.config.mjs`)
      writeFileSync(
        configFile,
        `export default { schema: ${JSON.stringify(schema)}, datasource: { url: 'postgresql://localhost/unused' } }\n`,
      )
      const diff = spawnSync(
        join(root, 'packages/hekireki/node_modules/.bin/prisma'),
        [
          'migrate',
          'diff',
          '--config',
          configFile,
          '--from-empty',
          '--to-schema',
          schema,
          '--script',
        ],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
      )
      expect(diff.status).toBe(0)
      writeFileSync(join(harness, `${name}.sql`), diff.stdout)
    }
    rmSync(config, { recursive: true, force: true })

    expect(dotnet(['restore', '--locked-mode'])).toBe(0)
  })

  // Nullable reference types on and every warning an error, so a nullability slip in the
  // generated code fails here rather than in a user's build.
  it.skipIf(!hasDotnet)('compiles against the real EF Core and Npgsql API', () => {
    expect(dotnet(['build', '--no-restore'])).toBe(0)
  })

  it.skipIf(!hasDotnet)('is already in the form dotnet format writes', () => {
    expect(
      dotnet(['format', 'Harness.csproj', '--verify-no-changes', '--include', 'Models/', 'Edge/']),
    ).toBe(0)
  })

  // Building the model runs EF Core's model validation: a column type the provider cannot map, a
  // relationship it cannot resolve or a key it cannot generate fails here, before any database.
  it.skipIf(!hasDotnet).each(SCHEMAS)('%s: the model validates and scripts a schema', (name) => {
    expect(dotnet(['run', '--no-build', '--', 'script', name], 'ignore')).toBe(0)
  })

  // The database EF Core creates from the model against the one Prisma Migrate creates from the
  // schema, fact by fact from PostgreSQL's catalog: tables, column types, nullability, defaults,
  // keys, foreign keys with their delete actions, indexes and enum labels in order. Only the
  // differences Program.cs lists — each one documented — may remain.
  it.skipIf(!(hasDotnet && hasPostgres)).each(SCHEMAS)(
    '%s: creates the schema Prisma Migrate creates',
    (name) => {
      expect(dotnet(['run', '--no-build', '--', 'compare', name, `${name}.sql`])).toBe(0)
    },
  )

  // Reads and writes through the model on the database Prisma Migrate creates, checking the raw
  // columns: defaults, generated ids, @updatedAt, enums, lists, native types, referential actions
  // and the join tables' A/B columns.
  it.skipIf(!(hasDotnet && hasPostgres)).each(SCHEMAS)(
    '%s: reads and writes the database Prisma Migrate creates',
    (name) => {
      expect(dotnet(['run', '--no-build', '--', 'smoke', name, `${name}.sql`])).toBe(0)
    },
  )
})
