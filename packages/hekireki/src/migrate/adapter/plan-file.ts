import path from 'node:path'

import { Effect } from 'effect'

import { emitRaw } from '../../emit/index.js'
import { readFile } from '../../file/index.js'
import { MigrateConfigError } from '../errors.js'

/** The migration.sql Prisma wrote, for `migrate plan --migration`. */
export function readMigration(file: string) {
  return readFile(file).pipe(
    Effect.map((sql) => ({ path: file, sql })),
    Effect.mapError(
      () =>
        new MigrateConfigError({
          message: `Migration not found: ${file}\n   Pass the migration.sql Prisma wrote for this schema.`,
        }),
    ),
  )
}

/** Writes the plan to the file, its directory created as needed. */
export function writePlan(sql: string, output: string) {
  return emitRaw(sql, path.dirname(output), output).pipe(
    Effect.mapError((error) => new MigrateConfigError({ message: error.message })),
  )
}
