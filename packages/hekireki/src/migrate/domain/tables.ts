import type { DMMF } from '@prisma/generator-helper'

/** The `@default(...)` functions Prisma Client fills in: the column itself has no default. */
const CLIENT_DEFAULTS = new Set(['uuid', 'cuid', 'nanoid', 'ulid'])

/**
 * Whether the database fills the column when a row leaves it out: a literal, `now()`,
 * `autoincrement()`, `dbgenerated()`. Not `uuid()`, `cuid()`, `nanoid()`, `ulid()` or
 * `@updatedAt`, which Prisma Client computes, so Prisma Migrate adds such a column as NOT NULL
 * with no default.
 */
function hasDatabaseDefault(field: DMMF.Field) {
  const value = field.default
  if (!field.hasDefaultValue || value === undefined) return false
  if (Array.isArray(value) || typeof value !== 'object') return true
  return !('name' in value) || !CLIENT_DEFAULTS.has(value.name)
}

function columnOf(model: DMMF.Model, field: string) {
  return model.fields.find((f) => f.name === field)?.dbName ?? field
}

/** The values the database holds for an enum, `@map` applied. */
function enumValues(enums: readonly DMMF.DatamodelEnum[], type: string) {
  const declared = enums.find((e) => e.name === type)
  return declared === undefined ? null : declared.values.map((value) => value.dbName ?? value.name)
}

/** The name of an enum's type in the database, `@@map` applied. */
function enumType(enums: readonly DMMF.DatamodelEnum[], type: string) {
  const declared = enums.find((e) => e.name === type)
  return declared === undefined ? null : (declared.dbName ?? declared.name)
}

/** The members of an enum by Prisma name and by the value the database holds. */
function enumMembers(enums: readonly DMMF.DatamodelEnum[], type: string) {
  const declared = enums.find((e) => e.name === type)
  return declared === undefined
    ? null
    : declared.values.map((value) => ({ name: value.name, dbName: value.dbName ?? value.name }))
}

function fieldColumn(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[]) {
  // Written out rather than inferred: the DMMF names these by types of `@prisma/dmmf`, which a
  // module that only reads the tables cannot name in its declarations.
  const kind: 'scalar' | 'object' | 'enum' | 'unsupported' = field.kind
  const nativeType: readonly [string, readonly string[]] | null = field.nativeType ?? null
  const isList: boolean = field.isList
  return {
    field: field.name,
    column: field.dbName ?? field.name,
    type: field.type,
    kind,
    nativeType,
    isList,
    // Prisma Migrate creates a scalar list column without NOT NULL.
    required: field.isRequired && !field.isList,
    databaseDefault: hasDatabaseDefault(field),
    // What `@default(...)` says, for the page to suggest it for the rows already there: a literal
    // (an enum member by its Prisma name), or the name of the function (`uuid`, `now`, ...).
    defaultValue:
      typeof field.default === 'string' ||
      typeof field.default === 'number' ||
      typeof field.default === 'boolean'
        ? String(field.default)
        : null,
    defaultFunction:
      typeof field.default === 'object' && field.default !== null && 'name' in field.default
        ? field.default.name
        : null,
    updatedAt: field.isUpdatedAt ?? false,
    enumValues: field.kind === 'enum' ? enumValues(enums, field.type) : null,
    enumMembers: field.kind === 'enum' ? enumMembers(enums, field.type) : null,
    enumType: field.kind === 'enum' ? enumType(enums, field.type) : null,
  }
}

/** Every unique key of a model, the primary key included: the fields for the report, the columns for the query. */
function uniqueSets(model: DMMF.Model) {
  const singles = model.fields
    .filter((f) => f.kind !== 'object' && (f.isUnique || f.isId))
    .map((f) => [f.name])
  const composite = [
    ...(model.primaryKey === null ? [] : [model.primaryKey.fields]),
    ...model.uniqueFields,
  ]
  const all: readonly (readonly string[])[] = [...singles, ...composite]
  return all
    .filter((set, index) => all.findIndex((other) => other.join(' ') === set.join(' ')) === index)
    .map((fields) => ({ fields, columns: fields.map((field) => columnOf(model, field)) }))
}

function makeModelTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
) {
  // A relation field that holds the foreign key: the side `@relation(fields: [...])` is on.
  const related = model.fields.filter(
    (f) => f.kind === 'object' && (f.relationFromFields ?? []).length > 0,
  )
  const foreignKeys = related.flatMap((f) => {
    const target = models.find((m) => m.name === f.type)
    if (target === undefined) return []
    return [
      {
        field: f.name,
        fromColumns: (f.relationFromFields ?? []).map((field) => columnOf(model, field)),
        toModel: target.name,
        toTable: target.dbName ?? target.name,
        toSchema: target.schema ?? null,
        toColumns: (f.relationToFields ?? []).map((field) => columnOf(target, field)),
      },
    ]
  })
  const primaryKey =
    model.primaryKey === null
      ? model.fields.filter((f) => f.isId).map((f) => f.dbName ?? f.name)
      : model.primaryKey.fields.map((field) => columnOf(model, field))
  return {
    model: model.name,
    table: model.dbName ?? model.name,
    schema: model.schema ?? null,
    primaryKey,
    columns: model.fields.filter((f) => f.kind !== 'object').map((f) => fieldColumn(f, enums)),
    uniques: uniqueSets(model),
    foreignKeys,
  }
}

function idField(model: DMMF.Model) {
  return model.fields.find((f) => f.isId) ?? model.fields[0]
}

function joinColumn(model: DMMF.Model, column: 'A' | 'B', enums: readonly DMMF.DatamodelEnum[]) {
  const id = idField(model)
  return {
    field: column,
    column,
    type: id?.type ?? 'Int',
    kind: id?.kind ?? 'scalar',
    nativeType: id?.nativeType ?? null,
    isList: false,
    required: true,
    databaseDefault: false,
    defaultValue: null,
    defaultFunction: null,
    updatedAt: false,
    enumValues: id?.kind === 'enum' ? enumValues(enums, id.type) : null,
    enumMembers: id?.kind === 'enum' ? enumMembers(enums, id.type) : null,
    enumType: id?.kind === 'enum' ? enumType(enums, id.type) : null,
  }
}

function joinForeignKey(model: DMMF.Model, column: 'A' | 'B') {
  const id = idField(model)
  return {
    field: column,
    fromColumns: [column],
    toModel: model.name,
    toTable: model.dbName ?? model.name,
    toSchema: model.schema ?? null,
    toColumns: [id?.dbName ?? id?.name ?? 'id'],
  }
}

/** The `_AToB` table Prisma keeps each implicit many-to-many relation in, once per relation. */
function makeJoinTables(models: readonly DMMF.Model[], enums: readonly DMMF.DatamodelEnum[]) {
  return models.flatMap((model) =>
    model.fields
      // A list relation with no foreign key on either side is an implicit many-to-many.
      .filter((f) => f.kind === 'object' && f.isList && (f.relationFromFields ?? []).length === 0)
      .flatMap((field) => {
        const other = models.find((m) => m.name === field.type)
        const inverse = other?.fields.find(
          (f) =>
            f.kind === 'object' &&
            f.relationName === field.relationName &&
            f.type === model.name &&
            !(other.name === model.name && f.name === field.name),
        )
        if (other === undefined || inverse === undefined || !inverse.isList) return []
        // Emitted from the side that sorts first; a self relation from its first field.
        const first =
          model.name === other.name ? field.name < inverse.name : model.name < other.name
        if (!first) return []
        const name = `_${field.relationName ?? `${model.name}To${other.name}`}`
        return [
          {
            model: name,
            table: name,
            schema: model.schema ?? null,
            primaryKey: ['A', 'B'],
            columns: [joinColumn(model, 'A', enums), joinColumn(other, 'B', enums)],
            uniques: [{ fields: ['A', 'B'], columns: ['A', 'B'] }],
            foreignKeys: [joinForeignKey(model, 'A'), joinForeignKey(other, 'B')],
          },
        ]
      }),
  )
}

/**
 * Every table the schema expects the database to have: the models, then the implicit join
 * tables. A column's `nativeType` is `@db.VarChar(10)` as `['VarChar', ['10']]`;
 * `databaseDefault` says the database fills it for rows already there, so it can be added NOT
 * NULL to a table that has some; `enumValues` are the values an enum field may hold in the
 * database, and `enumType` the name of its type there. A foreign key is the relation field, the
 * columns it is stored in, and the table and columns it points at.
 */
export function makeExpectedTables(datamodel: DMMF.Datamodel) {
  return [
    ...datamodel.models.map((model) => makeModelTable(model, datamodel.models, datamodel.enums)),
    ...makeJoinTables(datamodel.models, datamodel.enums),
  ]
}
