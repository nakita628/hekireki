import type { DMMF } from '@prisma/generator-helper'

import {
  collectM2MJoinEntries,
  makeDbInterface,
  makeEnumDeclarations,
  makeM2MJoinInterface,
  makeTableInterface,
} from '../helper/kysely.js'

// kysely's own Generated<S> is a plain ColumnType<S, S | undefined, S> and
// does not unwrap a nested ColumnType, so Generated<Timestamp> would select
// as the ColumnType object instead of Date. The generated file therefore
// carries its own unwrapping Generated, the same shape prisma-kysely emits.
const GENERATED_ALIAS =
  'export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>'

const TIMESTAMP_ALIAS = 'export type Timestamp = ColumnType<Date, Date | string, Date | string>'

export function kyselySchema(datamodel: DMMF.Datamodel) {
  const models = datamodel.models
  const joinEntries = collectM2MJoinEntries(models)
  const columnFields = models.flatMap((model) =>
    model.fields.filter((field) => field.kind === 'scalar' || field.kind === 'enum'),
  )
  const usesTimestamp =
    columnFields.some((field) => field.kind === 'scalar' && field.type === 'DateTime') ||
    joinEntries.some((entry) => entry.aType === 'Timestamp' || entry.bType === 'Timestamp')
  const usesGenerated = columnFields.some((field) => field.hasDefaultValue)
  return [
    ...(usesGenerated || usesTimestamp ? [`import type { ColumnType } from 'kysely'`] : []),
    ...(usesGenerated ? [GENERATED_ALIAS] : []),
    ...(usesTimestamp ? [TIMESTAMP_ALIAS] : []),
    ...makeEnumDeclarations(models, datamodel.enums),
    ...models.map((model) => makeTableInterface(model)),
    ...joinEntries.map((entry) => makeM2MJoinInterface(entry)),
    makeDbInterface(models, joinEntries),
  ].join('\n\n')
}
