import * as z from 'zod'

import * as ValuesDomain from './values.js'

const Model = z
  .custom<{
    readonly name: string
    readonly dbName: string | null
    readonly primaryKey: readonly string[] | null
    readonly fields: readonly {
      readonly name: string
      readonly dbName: string | null
      readonly kind: string
      readonly type: string
      readonly isList: boolean
      readonly isId: boolean
      readonly isUnique: boolean
    }[]
  }>()
  .meta({ description: 'The part of a Studio model the SQL builders read' })

const Dialect = z
  .enum(['postgresql', 'mysql', 'sqlite'])
  .meta({ description: 'The SQL dialect of the connected database', example: 'postgresql' })

const Row = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .readonly()
  .meta({ description: 'A row keyed by Prisma field name' })

const Enums = z
  .array(
    z.custom<{
      readonly name: string
      readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
    }>(),
  )
  .readonly()
  .meta({ description: 'The schema enums, whose members may be `@map`ped to other names' })

const ModelInput = z.object({ model: Model }).readonly().meta({ description: 'A studio model' })

/** The scalar and enum fields, i.e. the table columns. */
export function tableColumns(input: z.infer<typeof ModelInput>) {
  return input.model.fields.filter((f) => f.kind !== 'object')
}

const ColumnNameInput = z
  .object({
    field: z
      .object({
        name: z.string().meta({ description: 'The Prisma field name.', example: 'createdAt' }),
        dbName: z
          .string()
          .nullable()
          .meta({ description: 'The @map column name, when set.', example: 'created_at' }),
      })
      .readonly()
      .meta({ description: 'The field to name a column for.' }),
  })
  .readonly()
  .meta({ description: 'A field with its optional @map name' })

/** The database column of a field: `@map` when present, else the field name. */
export function columnName(input: z.infer<typeof ColumnNameInput>) {
  return input.field.dbName ?? input.field.name
}

/** The fields that identify a row: `@@id`, then `@id`, then the first `@unique`; empty means read-only. */
export function keyFields(input: z.infer<typeof ModelInput>) {
  const { model } = input
  const composite = model.primaryKey ?? []
  if (composite.length > 0) return composite
  const id = model.fields.find((f) => f.isId)
  if (id) return [id.name]
  const unique = model.fields.find((f) => f.isUnique && f.kind !== 'object')
  return unique ? [unique.name] : []
}

/** The database table of a model: `@@map` when present, else the model name. */
export function tableName(input: z.infer<typeof ModelInput>) {
  return input.model.dbName ?? input.model.name
}

const EnumMapInput = z
  .object({ model: Model, enums: Enums })
  .readonly()
  .meta({ description: 'A model and the schema enums its fields may refer to' })

/** The stored name of every member of an enum: its `@map`, else the member name. */
function memberNames(
  enums: z.infer<typeof Enums>,
  type: string,
): readonly { readonly name: string; readonly dbName: string }[] {
  const declared = enums.find((e) => e.name === type)
  return (declared?.values ?? []).map((value) => ({
    name: value.name,
    dbName: value.dbName ?? value.name,
  }))
}

/**
 * Per column, the stored value of each enum member by its Prisma name, for the enum fields whose
 * members are `@map`ped. Writing `PUBLIC` into a column that holds `public` is a type error in
 * PostgreSQL and a silent truncation in MySQL, so the value is translated on its way in.
 */
export function makeEnumWriteValues(input: z.infer<typeof EnumMapInput>) {
  return new Map(
    tableColumns({ model: input.model })
      .filter((field) => field.kind === 'enum')
      .map((field) => [
        field.name,
        new Map(memberNames(input.enums, field.type).map((v) => [v.name, v.dbName])),
      ]),
  )
}

/** Per column, the Prisma name of each enum member by its stored value, for reading rows back. */
export function makeEnumReadValues(input: z.infer<typeof EnumMapInput>) {
  return new Map(
    tableColumns({ model: input.model })
      .filter((field) => field.kind === 'enum')
      .map((field) => [
        columnName({ field }),
        new Map(memberNames(input.enums, field.type).map((v) => [v.dbName, v.name])),
      ]),
  )
}

const ColumnValuesInput = z
  .object({ model: Model, dialect: Dialect, row: Row, enums: Enums.optional() })
  .readonly()
  .meta({ description: 'A row keyed by field name to translate into column values' })

/** Maps `{ fieldName: cell }` from the UI to `{ columnName: driverValue }` for the database. */
export function makeColumnValues(input: z.infer<typeof ColumnValuesInput>) {
  const fields = tableColumns({ model: input.model })
  const enumValues = makeEnumWriteValues({ model: input.model, enums: input.enums ?? [] })
  return Object.fromEntries(
    Object.entries(input.row).flatMap(([name, value]) => {
      const field = fields.find((f) => f.name === name)
      if (!field) return []
      const stored = typeof value === 'string' ? (enumValues.get(name)?.get(value) ?? value) : value
      return [
        [
          columnName({ field }),
          ValuesDomain.makeDbValue({ dialect: input.dialect, field, value: stored }),
        ],
      ]
    }),
  )
}
