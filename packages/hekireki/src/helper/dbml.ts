import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../utils/index.js'
import { annotatedERRelations, erKey, inferredERRelations } from './relation.js'
import type { Cardinality } from './relation.js'

export function escapeNote(str: string) {
  return str.replaceAll("'", "\\'")
}

export function formatConstraints(constraints: readonly string[]) {
  return constraints.length > 0 ? ` [${constraints.join(', ')}]` : ''
}

export function makeEnum(enumDef: { readonly name: string; readonly values: readonly string[] }) {
  return [`Enum ${enumDef.name} {`, ...enumDef.values.map((v) => `  ${v}`), '}'].join('\n')
}

export function makeRefName(ref: {
  readonly name?: string
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
}) {
  return ref.name ?? `${ref.fromTable}_${ref.fromColumn}_${ref.toTable}_${ref.toColumn}_fk`
}

export function combineKeys(keys: readonly string[]) {
  return keys.length > 1 ? `(${keys.join(', ')})` : keys[0]
}

function escapeTriple(str: string) {
  return str.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function noteLiteral(value: string) {
  return value.includes('\n') ? `'''${escapeTriple(value)}'''` : `'${escapeNote(value)}'`
}

function makeIndex(index: {
  readonly columns: readonly string[]
  readonly isPrimaryKey?: boolean
  readonly isUnique?: boolean
  readonly name?: string
}) {
  const columns = index.columns.length > 1 ? `(${index.columns.join(', ')})` : index.columns[0]

  const constraints = [
    index.isPrimaryKey && 'pk',
    index.isUnique && 'unique',
    index.name && `name: '${index.name}'`,
  ].filter((c): c is string => Boolean(c))

  return `    ${columns}${formatConstraints(constraints)}`
}

function toDbmlAction(action: string) {
  if (action === 'Cascade') return 'cascade'
  if (action === 'SetNull') return 'set null'
  if (action === 'SetDefault') return 'set default'
  if (action === 'NoAction') return 'no action'
  if (action === 'Restrict') return 'restrict'
  return action
}

function makeRef(ref: {
  readonly name?: string
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
  readonly type?: '>' | '<' | '-'
  readonly onDelete?: string
  readonly onUpdate?: string
}) {
  const name = makeRefName(ref)
  const operator = ref.type ?? '>'

  const actions = [
    ref.onDelete && `delete: ${toDbmlAction(ref.onDelete)}`,
    ref.onUpdate && `update: ${toDbmlAction(ref.onUpdate)}`,
  ].filter((a): a is string => Boolean(a))

  const actionStr = actions.length > 0 ? ` [${actions.join(', ')}]` : ''

  return `Ref ${name}: ${ref.fromTable}.${ref.fromColumn} ${operator} ${ref.toTable}.${ref.toColumn}${actionStr}`
}

function makePrismaColumn(column: {
  readonly name: string
  readonly type: string
  readonly isPrimaryKey?: boolean
  readonly isUnique?: boolean
  readonly isNotNull?: boolean
  readonly isIncrement?: boolean
  readonly defaultValue?: string
  readonly note?: string
}) {
  const constraints = [
    column.isPrimaryKey && 'pk',
    column.isIncrement && 'increment',
    column.defaultValue !== undefined && `default: ${column.defaultValue}`,
    column.isUnique && 'unique',
    column.isNotNull && 'not null',
    column.note && `note: ${noteLiteral(column.note)}`,
  ].filter((c): c is string => Boolean(c))

  return `  ${column.name} ${column.type}${formatConstraints(constraints)}`
}

/**
 * The name a model, field, enum or enum value has in the database: its `@map` / `@@map` when it
 * has one, its Prisma name otherwise. DBML describes the database, so every name it writes is this.
 */
function dbNameOf(item: { readonly name: string; readonly dbName?: string | null }) {
  return item.dbName ?? item.name
}

/** The column a Prisma field of `model` is stored in. */
function columnOf(model: DMMF.Model | undefined, field: string) {
  const found = model?.fields.find((f) => f.name === field)
  return found ? dbNameOf(found) : field
}

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && 'name' in def
}

function toDBMLColumn(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[]) {
  const defaultName = isFunctionDefault(field.default) ? field.default.name : undefined
  // An enum column holds the enum's mapped type and its values' mapped names.
  const enumDef = field.kind === 'enum' ? enums.find((e) => e.name === field.type) : undefined

  const baseType = enumDef ? dbNameOf(enumDef) : field.type
  const type = field.isList && !field.relationName ? `${baseType}[]` : baseType

  const defaultValue = (() => {
    if (defaultName === 'autoincrement') return undefined
    if (defaultName === 'now') return '`now()`'
    if (field.hasDefaultValue && typeof field.default !== 'object') {
      if (field.kind === 'enum') {
        const value = enumDef?.values.find((v) => v.name === field.default)
        return `'${value ? dbNameOf(value) : String(field.default)}'`
      }
      return field.type === 'String' || field.type === 'Json'
        ? `'${field.default}'`
        : String(field.default)
    }
    return undefined
  })()

  return {
    name: dbNameOf(field),
    type,
    isPrimaryKey: field.isId,
    isIncrement: defaultName === 'autoincrement',
    isUnique: field.isUnique,
    isNotNull: field.isRequired && !field.isId,
    defaultValue,
    note: stripAnnotations(field.documentation),
  }
}

export function makeTables(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] = [],
) {
  return models.map((model) => {
    const modelName = dbNameOf(model)

    const columns = model.fields
      .filter((field) => !field.relationName)
      .map((field) => toDBMLColumn(field, enums))
    const columnLines = columns.map(makePrismaColumn).join('\n')

    const columnsOf = (fields: readonly string[]) => fields.map((f) => columnOf(model, f))
    const indexes = [
      ...(model.primaryKey?.fields && model.primaryKey.fields.length > 0
        ? [{ columns: columnsOf(model.primaryKey.fields), isPrimaryKey: true }]
        : []),
      ...model.uniqueFields
        .filter((c) => c.length > 1)
        .map((c) => ({ columns: columnsOf(c), isUnique: true })),
    ]
    const indexBlock =
      indexes.length > 0 ? `\n\n  indexes {\n${indexes.map(makeIndex).join('\n')}\n  }` : ''

    const strippedNote = stripAnnotations(model.documentation)
    const noteBlock = strippedNote ? `\n\n  Note: ${noteLiteral(strippedNote)}` : ''

    return `Table ${modelName} {\n${columnLines}${indexBlock}${noteBlock}\n}`
  })
}

export function makeEnums(enums: readonly DMMF.DatamodelEnum[]) {
  return enums.map((e) =>
    makeEnum({
      name: dbNameOf(e),
      values: e.values.map(dbNameOf),
    }),
  )
}

export function makeRelations(models: readonly DMMF.Model[]) {
  return models.flatMap((model) =>
    model.fields
      .filter(
        (field) =>
          field.relationName && field.relationToFields?.length && field.relationFromFields?.length,
      )
      .map((field) => {
        const relationTo = field.type

        const toModel = models.find((m) => m.name === relationTo)
        // The back relation is the other field of the same relation, not merely the first field
        // pointing back at this model: a model can hold several relations to the same one.
        const toField = toModel?.fields.find(
          (f) =>
            f.kind === 'object' &&
            f.relationName === field.relationName &&
            !(toModel.name === model.name && f.name === field.name),
        )
        const operator: '>' | '<' | '-' = toField?.isList ? '>' : '-'

        const relationFromName = dbNameOf(model)
        const relationToName = toModel ? dbNameOf(toModel) : relationTo

        const fromColumn = combineKeys(
          (field.relationFromFields ?? []).map((f) => columnOf(model, f)),
        )
        const toColumn = combineKeys(
          (field.relationToFields ?? []).map((f) => columnOf(toModel, f)),
        )

        return makeRef({
          name: `${relationFromName}_${fromColumn}_fk`,
          fromTable: relationFromName,
          fromColumn,
          toTable: relationToName,
          toColumn,
          type: operator,
          onDelete: field.relationOnDelete,
          onUpdate: field.relationOnUpdate,
        })
      }),
  )
}

function isMany(cardinality: Cardinality) {
  return cardinality === 'many' || cardinality === 'zero-many'
}

// DBML has four relationship operators and no notion of zero/optional, so a
// cardinality pair collapses to one of them. The line reads `child OP parent`,
// i.e. left = `to` (child), right = `from` (parent).
// https://dbml.dbdiagram.io/docs/#relationships--foreign-key-definitions
function dbmlOperator(leftMany: boolean, rightMany: boolean) {
  if (leftMany && !rightMany) return '>'
  if (!leftMany && rightMany) return '<'
  if (leftMany && rightMany) return '<>'
  return '-'
}

// Emits `Ref` lines for logical relations declared by `/// @relation` that have
// NO physical FK backing them (annotation-only). Pairs already covered by a
// physical FK are left to `makeRelations`, which carries the richer FK metadata
// (onDelete, composite keys). Logical refs drop the `_fk` suffix that
// physical FKs carry, since they are not DB-enforced constraints.
export function annotatedDbmlRefs(models: readonly DMMF.Model[]) {
  const inferredKeys = new Set(inferredERRelations(models).map(erKey))
  // The annotation names Prisma models and fields; the ref names the tables and columns they map to.
  const end = (side: { readonly model: string; readonly field: string }) => {
    const model = models.find((m) => m.name === side.model)
    return { table: model ? dbNameOf(model) : side.model, column: columnOf(model, side.field) }
  }
  return annotatedERRelations(models)
    .filter((relation) => !inferredKeys.has(erKey(relation)))
    .map((relation) => {
      const to = end(relation.to)
      const from = end(relation.from)
      const operator = dbmlOperator(
        isMany(relation.to.cardinality),
        isMany(relation.from.cardinality),
      )
      const name = `${to.table}_${to.column}_${from.table}_${from.column}`
      return `Ref ${name}: ${to.table}.${to.column} ${operator} ${from.table}.${from.column}`
    })
}
