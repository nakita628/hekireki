import * as z from 'zod'

import * as ValuesDomain from './values.js'

const Model = z
  .object({
    name: z.string().meta({ description: 'The model name as declared.', example: 'User' }),
    dbName: z
      .string()
      .nullable()
      .meta({ description: 'The @@map table name, when set.', example: 'users' }),
    primaryKey: z
      .array(z.string())
      .readonly()
      .nullable()
      .meta({ description: 'The fields of a composite @@id, when the model has one.' }),
    fields: z
      .array(
        z
          .object({
            name: z.string().meta({ description: 'The Prisma field name.', example: 'createdAt' }),
            dbName: z
              .string()
              .nullable()
              .meta({ description: 'The @map column name, when set.', example: 'created_at' }),
            kind: z
              .string()
              .meta({ description: 'scalar, object, enum or unsupported.', example: 'scalar' }),
            type: z.string().meta({ description: 'The declared type.', example: 'DateTime' }),
            isList: z
              .boolean()
              .meta({ description: 'Whether the field is a list.', example: false }),
            isId: z.boolean().meta({ description: 'Whether the field is @id.', example: false }),
            isUnique: z
              .boolean()
              .meta({ description: 'Whether the field is @unique.', example: false }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'The fields of the model, relations included.' }),
  })
  .readonly()
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
    z
      .object({
        name: z.string().meta({ description: 'The enum name as declared.', example: 'Role' }),
        values: z
          .array(
            z
              .object({
                name: z
                  .string()
                  .meta({ description: 'The member name as declared.', example: 'ADMIN' }),
                dbName: z
                  .string()
                  .nullable()
                  .meta({ description: 'The @map stored value, when set.', example: 'admin' }),
              })
              .readonly(),
          )
          .readonly()
          .meta({ description: 'The members of the enum.' }),
      })
      .readonly(),
  )
  .readonly()
  .meta({ description: 'The schema enums, whose members may be `@map`ped to other names' })

const TableColumnsInput = z
  .object({ model: Model })
  .readonly()
  .meta({ description: 'A studio model' })

/** The scalar and enum fields, i.e. the table columns. */
export function tableColumns(input: z.infer<typeof TableColumnsInput>) {
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

const KeyFieldsInput = z.object({ model: Model }).readonly().meta({ description: 'A studio model' })

/** The fields that identify a row: `@@id`, then `@id`, then the first `@unique`; empty means read-only. */
export function keyFields(input: z.infer<typeof KeyFieldsInput>) {
  const { model } = input
  const composite = model.primaryKey ?? []
  if (composite.length > 0) return composite
  const id = model.fields.find((f) => f.isId)
  if (id) return [id.name]
  const unique = model.fields.find((f) => f.isUnique && f.kind !== 'object')
  return unique ? [unique.name] : []
}

const TableNameInput = z.object({ model: Model }).readonly().meta({ description: 'A studio model' })

/** The database table of a model: `@@map` when present, else the model name. */
export function tableName(input: z.infer<typeof TableNameInput>) {
  return input.model.dbName ?? input.model.name
}

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

const MakeEnumWriteValuesInput = z
  .object({ model: Model, enums: Enums })
  .readonly()
  .meta({ description: 'A model and the schema enums its fields may refer to' })

/**
 * Per column, the stored value of each enum member by its Prisma name, for the enum fields whose
 * members are `@map`ped. Writing `PUBLIC` into a column that holds `public` is a type error in
 * PostgreSQL and a silent truncation in MySQL, so the value is translated on its way in.
 */
export function makeEnumWriteValues(input: z.infer<typeof MakeEnumWriteValuesInput>) {
  return new Map(
    tableColumns({ model: input.model })
      .filter((field) => field.kind === 'enum')
      .map((field) => [
        field.name,
        new Map(memberNames(input.enums, field.type).map((v) => [v.name, v.dbName])),
      ]),
  )
}

const MakeEnumReadValuesInput = z
  .object({ model: Model, enums: Enums })
  .readonly()
  .meta({ description: 'A model and the schema enums its fields may refer to' })

/** Per column, the Prisma name of each enum member by its stored value, for reading rows back. */
export function makeEnumReadValues(input: z.infer<typeof MakeEnumReadValuesInput>) {
  return new Map(
    tableColumns({ model: input.model })
      .filter((field) => field.kind === 'enum')
      .map((field) => [
        columnName({ field }),
        new Map(memberNames(input.enums, field.type).map((v) => [v.dbName, v.name])),
      ]),
  )
}

const MakeColumnValuesInput = z
  .object({ model: Model, dialect: Dialect, row: Row, enums: Enums.optional() })
  .readonly()
  .meta({ description: 'A row keyed by field name to translate into column values' })

/** Maps `{ fieldName: cell }` from the UI to `{ columnName: driverValue }` for the database. */
export function makeColumnValues(input: z.infer<typeof MakeColumnValuesInput>) {
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
