import path from 'node:path'

import { Effect } from 'effect'

import type { Dialect } from '../../database/url.js'
import { splitStatements } from '../../sql/index.js'
import { MigrateConfigError } from '../errors.js'
import { makeOfflineSchemaEngineAdapter } from './engine-adapter.js'
import { engineCommand, openSchemaEngine } from './engine.js'
import type { Engine } from './engine.js'
import { findSchemaEngineBinary, openNativeSchemaEngine } from './native-engine.js'

type SchemaFiles = readonly { readonly path: string; readonly content: string }[]

/** What the engine writes to take an empty database to the schema, a statement each. */
function createStatements(engine: Engine, files: SchemaFiles) {
  return Effect.gen(function* () {
    const result = yield* engineCommand(() =>
      engine.diff({
        from: { tag: 'empty' },
        to: { tag: 'schemaDatamodel', files: [...files] },
        script: true,
        exitCode: false,
        filters: { externalTables: [], externalEnums: [] },
      }),
    )
    return splitStatements(result.stdout ?? '').flatMap((statement) => {
      // The engine heads each statement with a line comment naming what it does.
      const sql = statement
        .split('\n')
        .filter((line) => !line.startsWith('--'))
        .join('\n')
        .trim()
      return sql === '' ? [] : [`${sql};`]
    })
  })
}

/**
 * The statements that make the schema in an empty database, as `prisma migrate diff
 * --from-empty --to-schema` writes them, without the `-- CreateTable` line above each. Nothing
 * connects to a database: PostgreSQL and SQLite are written by the wasm engine on an adapter with
 * nothing behind it, MySQL (which it has no connector for) by the native engine the Prisma CLI
 * runs, which reads the files from where they are and is given a URL it never opens.
 *
 * @param input - the schema files, the dialect of their datasource, and where a relative
 *   `PRISMA_SCHEMA_ENGINE_BINARY` resolves from
 * @returns every statement, in the order the engine writes them
 * @example
 * For `User` (`id`, `name`) and `Post` (`id`, `authorId` → `User.id`), PostgreSQL:
 * ```sql
 * CREATE SCHEMA IF NOT EXISTS "public";
 * CREATE TABLE "User" (
 *     "id" SERIAL NOT NULL,
 *     "name" TEXT NOT NULL,
 *
 *     CONSTRAINT "User_pkey" PRIMARY KEY ("id")
 * );
 * CREATE TABLE "Post" (
 *     "id" SERIAL NOT NULL,
 *     "authorId" INTEGER NOT NULL,
 *
 *     CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
 * );
 * ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
 * ```
 * SQLite, the foreign key inside the table:
 * ```sql
 * CREATE TABLE "User" (
 *     "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
 *     "name" TEXT NOT NULL
 * );
 * CREATE TABLE "Post" (
 *     "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
 *     "authorId" INTEGER NOT NULL,
 *     CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
 * );
 * ```
 */
export function schemaSql(input: {
  readonly files: SchemaFiles
  readonly dialect: Dialect
  readonly cwd: string
}) {
  return Effect.gen(function* () {
    const { dialect, files } = input
    if (dialect !== 'mysql') {
      const engine = yield* openSchemaEngine({
        files,
        adapter: makeOfflineSchemaEngineAdapter(dialect),
      })
      return yield* createStatements(engine, files)
    }
    const binary = yield* findSchemaEngineBinary(input.cwd)
    if (binary === null) {
      return yield* new MigrateConfigError({
        message:
          "MySQL's SQL is written by Prisma's native schema engine, which was not found: install `@prisma/engines` (it comes with `prisma`, and has to be allowed to run its install script), or name the binary with PRISMA_SCHEMA_ENGINE_BINARY.",
      })
    }
    const engine = openNativeSchemaEngine({
      binary,
      files,
      url: 'mysql://localhost/hekireki',
      cwd: path.dirname(files[0]?.path ?? input.cwd),
    })
    return yield* createStatements(engine, files)
  })
}
