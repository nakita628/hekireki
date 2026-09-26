import type { DMMF } from '@prisma/generator-helper'

import {
  collectM2MJoinEntries,
  isDbGenerated,
  makeColumnType,
  makeDbInterface,
  makeEnumDeclarations,
  makeM2MJoinInterface,
  makeTableInterface,
  SCALAR_TYPE_MAP,
  SQLITE_SCALAR_TYPE_MAP,
} from '../helper/kysely.js'

// kysely's own Generated<S> is a plain ColumnType<S, S | undefined, S> and
// does not unwrap a nested ColumnType, so Generated<Timestamp> would select
// as the ColumnType object instead of Date. The generated file therefore
// carries its own unwrapping Generated, the same shape prisma-kysely emits.
const GENERATED_ALIAS =
  'export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>'

const TIMESTAMP_ALIAS = 'export type Timestamp = ColumnType<Date, Date | string, Date | string>'

// A DateTime Kysely writes on SQLite is equal to one Prisma wrote only as the same text.
const SQLITE_DATETIME_NOTE =
  "// A DateTime column holds the text date.toISOString().replace('Z', '+00:00')"

/**
 * The Kysely `DB` interface of a datamodel, typed as the driver of `provider` reads and binds
 * each column: on SQLite, as better-sqlite3 does (`SQLITE_SCALAR_TYPE_MAP`), where a DateTime is
 * text and the file says which text, and a DateTime default is left to the insert (Prisma Client
 * writes it, and SQLite's own is other text); a time column (`@db.Time`, `@db.Timetz`) as the text pg and
 * mysql2 read it as.
 */
export function kyselySchema(datamodel: DMMF.Datamodel, provider = 'postgresql') {
  const models = datamodel.models
  const scalarTypes = provider === 'sqlite' ? SQLITE_SCALAR_TYPE_MAP : SCALAR_TYPE_MAP
  const joinEntries = collectM2MJoinEntries(models, scalarTypes)
  const columnTypes = [
    ...models.flatMap((model) =>
      model.fields
        .filter((field) => field.kind === 'scalar')
        .map((field) => makeColumnType(field, scalarTypes, provider)),
    ),
    ...joinEntries.flatMap((entry) => [entry.aType, entry.bType]),
  ]
  const usesTimestamp = columnTypes.some((type) => /\bTimestamp\b/u.test(type))
  const usesGenerated = models.some((model) =>
    model.fields.some(
      (field) =>
        (field.kind === 'scalar' || field.kind === 'enum') && isDbGenerated(field, provider),
    ),
  )
  const usesColumnType =
    usesGenerated || usesTimestamp || columnTypes.some((type) => type.includes('ColumnType<'))
  const usesSqliteDateTime =
    provider === 'sqlite' &&
    models.some((model) =>
      model.fields.some((field) => field.kind === 'scalar' && field.type === 'DateTime'),
    )
  return [
    ...(usesColumnType ? [`import type { ColumnType } from 'kysely'`] : []),
    ...(usesGenerated ? [GENERATED_ALIAS] : []),
    ...(usesTimestamp ? [TIMESTAMP_ALIAS] : []),
    ...(usesSqliteDateTime ? [SQLITE_DATETIME_NOTE] : []),
    ...makeEnumDeclarations(models, datamodel.enums),
    ...models.map((model) => makeTableInterface(model, scalarTypes, provider)),
    ...joinEntries.map((entry) => makeM2MJoinInterface(entry)),
    makeDbInterface(models, joinEntries),
  ].join('\n\n')
}
