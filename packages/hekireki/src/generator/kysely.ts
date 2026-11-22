import type { DMMF } from '@prisma/generator-helper'

import {
  collectM2MJoinEntries,
  isDbGenerated,
  makeColumnType,
  makeDbInterface,
  makeEnumDeclarations,
  makeM2MJoinInterface,
  makeTableInterface,
  scalarTypeMap,
} from '../helper/kysely.js'

// kysely's own Generated<S> is a plain ColumnType<S, S | undefined, S> and
// does not unwrap a nested ColumnType, so Generated<Timestamp> would select
// as the ColumnType object instead of Date. The generated file therefore
// carries its own unwrapping Generated, the same shape prisma-kysely emits.
const GENERATED_ALIAS =
  'export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>'

const TIMESTAMP_ALIAS = 'export type Timestamp = ColumnType<Date, Date | string, Date | string>'

/**
 * The Kysely `DB` interface of a datamodel, typed as the default driver of the dialect for
 * `provider` reads and binds each column (`scalarTypeMap`): on PostgreSQL, as pg does, where a
 * BigInt reads as text and a list of an enum as the array's text; on MySQL, as mysql2 does, where a
 * BigInt and a Boolean read as numbers; on SQLite, as better-sqlite3 does, where a DateTime is
 * text, and a DateTime default is left to the insert (Prisma Client
 * writes it, and SQLite's own is other text); a time column (`@db.Time`, `@db.Timetz`) as the text pg and
 * mysql2 read it as. The prose of a model's, field's or enum's `///` comment
 * is its declaration's JSDoc.
 */
export function kyselySchema(datamodel: DMMF.Datamodel, provider = 'postgresql') {
  const models = datamodel.models
  const scalarTypes = scalarTypeMap(provider)
  const joinEntries = collectM2MJoinEntries(models, scalarTypes)
  const columnTypes = [
    ...models.flatMap((model) =>
      model.fields
        .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
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
  return [
    ...(usesColumnType ? [`import type { ColumnType } from 'kysely'`] : []),
    ...(usesGenerated ? [GENERATED_ALIAS] : []),
    ...(usesTimestamp ? [TIMESTAMP_ALIAS] : []),
    ...makeEnumDeclarations(models, datamodel.enums),
    ...models.map((model) => makeTableInterface(model, scalarTypes, provider)),
    ...joinEntries.map((entry) => makeM2MJoinInterface(entry)),
    makeDbInterface(models, joinEntries),
  ].join('\n\n')
}
