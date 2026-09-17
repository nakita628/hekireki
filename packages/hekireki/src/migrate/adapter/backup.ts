import path from 'node:path'

import { Effect } from 'effect'

import { exists, fileStamp, makeDirectory, readDirectory, writeFile } from '../../file/index.js'
import { quoteIdentifier } from '../../sql/index.js'
import type { Driver } from '../../studio/server/services/database.js'
import { stringLiteral } from '../domain/dialect.js'
import { MigrateConfigError } from '../errors.js'
import { createPostgresBackup, restorePostgresBackup } from './backup-postgres.js'

// A copy of the database taken before a migration that loses data, so what it lost can be had
// back. On SQLite it is the whole file, and restoring it puts the database back as it was,
// history and all. On PostgreSQL it is every table of the schema copied into a schema of its own,
// with the statements that make the schema again as it was (backup-postgres.ts): a restore runs
// them in one transaction and commits only a database that is the one the backup was taken of.

/** Where the backups of a project are kept, beside its decisions and out of version control. */
export function backupsDirectory(schemaDir: string) {
  return path.join(schemaDir, '.hekireki', 'backups')
}

/**
 * Takes a backup of the database as it is now: on SQLite a copy of the file in the backups
 * directory (with a `.gitignore` there, so it is never committed); on PostgreSQL a schema named
 * for the backup, holding a copy of every table of `public`.
 *
 * @param input - the open connection, and the directory the schema lives in
 * @returns the backup's name and where it is
 *
 * @example
 * ```sql
 * -- SQLite: the whole file, copied by the database itself
 * VACUUM INTO '/app/prisma/.hekireki/backups/backup_20260201093000123.db'
 *
 * -- PostgreSQL: see `postgresBackupStatements` and `postgresRestoreStatements`
 * ```
 */
export function createBackup(input: { readonly driver: Driver; readonly schemaDir: string }) {
  return Effect.gen(function* () {
    const { driver } = input
    // Named for when it was taken, as a file or schema name can hold it: `backup_20260201093000123`.
    const name = `backup_${new Date()
      .toISOString()
      .replaceAll(/[-:T.Z]/gu, '')
      .slice(0, 17)}`
    if (driver.dialect === 'sqlite') {
      const directory = backupsDirectory(input.schemaDir)
      yield* makeDirectory(directory)
      const ignore = path.join(input.schemaDir, '.hekireki', '.gitignore')
      if (!(yield* exists(ignore))) yield* writeFile(ignore, 'backups/\n')
      const file = path.join(directory, `${name}.db`)
      yield* driver
        .executeScript(`VACUUM INTO ${stringLiteral('sqlite', file)}`)
        .pipe(
          Effect.mapError(
            (error) =>
              new MigrateConfigError({ message: `The backup could not be taken: ${error.cause}` }),
          ),
        )
      return { name, location: file }
    }
    if (driver.dialect === 'mysql') {
      return yield* new MigrateConfigError({ message: 'Studio cannot back up a MySQL database.' })
    }
    yield* createPostgresBackup(driver, name)
    return { name, location: `schema ${name}` }
  })
}

/**
 * The backups there are, newest first: the files of the backups directory on SQLite, the backup
 * schemas on PostgreSQL.
 *
 * @param input - the open connection, and the directory the schema lives in
 * @returns each backup's name, where it is and, for a file, its size in bytes
 */
export function listBackups(input: { readonly driver: Driver; readonly schemaDir: string }) {
  return Effect.gen(function* () {
    const { driver } = input
    if (driver.dialect === 'sqlite') {
      const directory = backupsDirectory(input.schemaDir)
      const names = yield* readDirectory(directory).pipe(
        Effect.orElseSucceed((): readonly string[] => []),
      )
      const files = names
        .filter((one) => /^backup_\d+\.db$/u.test(one))
        .toSorted()
        .toReversed()
      return yield* Effect.forEach(files, (file) =>
        fileStamp(path.join(directory, file)).pipe(
          Effect.map((stamp) => ({
            name: file.replace(/\.db$/u, ''),
            location: path.join(directory, file),
            size: Number(stamp?.split(':')[1] ?? 0),
            restorable: true,
          })),
        ),
      )
    }
    // A backup that keeps the statements of its restore can be restored; one taken before Studio
    // kept them holds the rows only.
    const found = yield* driver
      .query({
        sql: "SELECT n.nspname AS name, EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid AND c.relname = '_hekireki_restore') AS restorable FROM pg_namespace n WHERE n.nspname LIKE 'backup\\_%' ORDER BY n.nspname DESC",
        params: [],
      })
      .pipe(Effect.orElseSucceed(() => ({ rows: [] })))
    return found.rows.map((row) => ({
      name: String(row.name),
      location: `schema ${String(row.name)}`,
      size: null,
      restorable: row.restorable === true,
    }))
  })
}

/**
 * Puts a SQLite database back as a backup has it: every table, index, view and trigger of the
 * database replaced by the backup's, rows and migration history included, through the connection
 * Studio holds and in one transaction, so it is all or nothing.
 *
 * @param input - the open connection, the directory the schema lives in, and the backup's name
 */
export function restoreBackup(input: {
  readonly driver: Driver
  readonly schemaDir: string
  readonly name: string
}) {
  return Effect.gen(function* () {
    const { driver } = input
    if (driver.dialect === 'mysql' || !/^backup_\d+$/u.test(input.name)) {
      return yield* new MigrateConfigError({ message: `There is no backup ${input.name}.` })
    }
    if (driver.dialect === 'postgresql') return yield* restorePostgresBackup(driver, input.name)
    const file = path.join(backupsDirectory(input.schemaDir), `${input.name}.db`)
    if (!(yield* exists(file))) {
      return yield* new MigrateConfigError({ message: `There is no backup ${input.name}.` })
    }
    yield* driver
      .executeScript(`ATTACH DATABASE ${stringLiteral('sqlite', file)} AS hekireki_backup`)
      .pipe(
        Effect.mapError(
          (error) =>
            new MigrateConfigError({
              message: `The backup could not be restored: ${error.cause}`,
            }),
        ),
      )
    return yield* replaceWithAttached(driver).pipe(
      Effect.mapError(
        (error) =>
          new MigrateConfigError({ message: `The backup could not be restored: ${error.cause}` }),
      ),
      Effect.ensuring(driver.executeScript('DETACH DATABASE hekireki_backup').pipe(Effect.ignore)),
    )
  })
}

/**
 * The tables, indexes, views and triggers of one attached database, tables first so what depends
 * on them can be made after.
 */
function backupObjects(driver: Driver, schema: string) {
  return driver.query({
    sql: `SELECT type, name, sql FROM ${schema}.sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, rowid`,
    params: [],
  })
}

/**
 * Replaces everything in the main database with what the attached backup holds, in one
 * transaction, foreign keys off while the tables are empty.
 *
 * @example
 * ```sql
 * PRAGMA foreign_keys=OFF;
 * BEGIN;
 * DROP TABLE IF EXISTS main."User";
 * CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "email" TEXT NOT NULL);
 * CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
 * INSERT INTO main."User" SELECT * FROM hekireki_backup."User";
 * COMMIT;
 * PRAGMA foreign_keys=ON
 * ```
 */
function replaceWithAttached(driver: Driver) {
  return Effect.gen(function* () {
    const current = yield* backupObjects(driver, 'main')
    const saved = yield* backupObjects(driver, 'hekireki_backup')
    const drops = current.rows
      .filter((row) => row.type === 'table' || row.type === 'view')
      .map(
        (row) =>
          `DROP ${row.type === 'view' ? 'VIEW' : 'TABLE'} IF EXISTS main.${quoteIdentifier('sqlite', String(row.name))}`,
      )
    const creates = saved.rows.map((row) => String(row.sql))
    const copies = saved.rows
      .filter((row) => row.type === 'table')
      .map(
        (row) =>
          `INSERT INTO main.${quoteIdentifier('sqlite', String(row.name))} SELECT * FROM hekireki_backup.${quoteIdentifier('sqlite', String(row.name))}`,
      )
    const sequence = (yield* driver.query({
      sql: "SELECT COUNT(*) AS count FROM hekireki_backup.sqlite_master WHERE name = 'sqlite_sequence'",
      params: [],
    })).rows[0]?.count
    yield* driver
      .executeScript(
        [
          'PRAGMA foreign_keys=OFF',
          'BEGIN',
          ...drops,
          ...creates,
          ...copies,
          ...(Number(sequence) > 0
            ? [
                'DELETE FROM main.sqlite_sequence',
                'INSERT INTO main.sqlite_sequence SELECT * FROM hekireki_backup.sqlite_sequence',
              ]
            : []),
          'COMMIT',
          'PRAGMA foreign_keys=ON',
        ].join(';\n'),
      )
      .pipe(Effect.tapError(() => driver.executeScript('ROLLBACK').pipe(Effect.ignore)))
  })
}
