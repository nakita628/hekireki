import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vite-plus/test'

const root = resolve(import.meta.dirname, '..', '..')
const harness = resolve(import.meta.dirname, '..', 'harness', 'exposed')
// Gradle compiles for the JDK 21 the build asks for, so Java 21 is part of the toolchain.
const hasGradle = spawnSync('gradle', ['--version'], { stdio: 'ignore' }).status === 0
// The server the database checks create their databases on: a JDBC URL whose path is left empty
// for the database, e.g. `jdbc:postgresql://localhost:5432/?user=postgres&password=postgres`.
const hasPostgres = process.env.HEKIREKI_EXPOSED_PG !== undefined

// `main` is what Hekireki-Exposed writes for test/prisma/schema.prisma, `edge` for
// test/prisma/exposed.prisma.
const SCHEMAS = [
  ['main', 'schema.prisma'],
  ['edge', 'exposed.prisma'],
] as const

function gradle(args: readonly string[]) {
  return spawnSync('gradle', ['--console=plain', '--quiet', ...args], {
    cwd: harness,
    stdio: ['ignore', 'inherit', 'inherit'],
  }).status
}

function harnessRun(args: readonly string[]) {
  return spawnSync(join(harness, 'build/install/harness/bin/harness'), args, {
    cwd: harness,
    stdio: ['ignore', 'inherit', 'inherit'],
  }).status
}

describe('exposed', () => {
  // Skipping keeps `vp test` runnable without Gradle or PostgreSQL; a CI leg that silently skipped
  // would be a false green.
  it.runIf(!!process.env.CI)('Gradle and a PostgreSQL server are available', () => {
    expect({ gradle: hasGradle, postgres: hasPostgres }).toStrictEqual({
      gradle: true,
      postgres: true,
    })
  })

  beforeAll(() => {
    if (!hasGradle) return
    // Prisma Migrate's own DDL for each schema, which the database checks compare the Exposed
    // tables against. `migrate diff` wants a datasource URL even from an empty database; it never
    // connects to it.
    const config = mkdtempSync(join(tmpdir(), 'hekireki-exposed-'))
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
  })

  // Every warning an error, so an unchecked cast or a deprecated API in the generated code fails
  // here rather than in a user's build. The dependencies are locked and verified by checksum.
  it.skipIf(!hasGradle)('compiles against the real Exposed API', () => {
    expect(gradle(['installDist'])).toBe(0)
  })

  it.skipIf(!hasGradle)('is already in the form ktlint writes', () => {
    expect(gradle(['ktlint'])).toBe(0)
  })

  // The database SchemaUtils.create makes from the tables against the one Prisma Migrate makes from
  // the schema, fact by fact from PostgreSQL's catalog: tables, column types, nullability, defaults,
  // keys, foreign keys with their actions, indexes, sequences and enum labels in order. Only the
  // differences Main.kt lists — each one documented — may remain.
  it.skipIf(!(hasGradle && hasPostgres)).each(SCHEMAS)(
    '%s: creates the schema Prisma Migrate creates',
    (name) => {
      expect(harnessRun(['compare', name, `${name}.sql`])).toBe(0)
    },
  )

  // Each statement MigrationUtils asks for on Prisma's database is run on a copy of it: those that
  // change anything are the ways Exposed misreads the catalog, each one documented in Main.kt.
  it.skipIf(!(hasGradle && hasPostgres)).each(SCHEMAS)(
    '%s: what MigrationUtils asks for is a no-op or documented',
    (name) => {
      expect(harnessRun(['migrate', name, `${name}.sql`])).toBe(0)
    },
  )

  // Reads and writes through the tables and the entities on the database Prisma Migrate creates,
  // checking the raw columns: defaults, generated ids, @updatedAt, enums, lists, native types, time
  // zones, referential actions and the join tables' A/B columns.
  it.skipIf(!(hasGradle && hasPostgres)).each(SCHEMAS)(
    '%s: reads and writes the database Prisma Migrate creates',
    (name) => {
      expect(harnessRun(['smoke', name, `${name}.sql`])).toBe(0)
    },
  )
})
