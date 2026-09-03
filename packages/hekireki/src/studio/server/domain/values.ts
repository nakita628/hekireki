import * as z from 'zod'

const Dialect = z
  .enum(['postgresql', 'mysql', 'sqlite'])
  .meta({ description: 'The SQL dialect of the connected database', example: 'postgresql' })

const Cell = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .meta({ description: 'A JSON cell value as the UI sends and shows it' })

const SerializeCellInput = z
  .object({ value: z.unknown().meta({ description: 'The raw driver value.' }) })
  .readonly()
  .meta({ description: 'Any value a database driver hands back' })

/** Turns a driver value into a JSON cell: bigint and Date become strings, bytes base64, objects JSON text. */
export function makeCell(input: z.infer<typeof SerializeCellInput>) {
  const { value } = input
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  return JSON.stringify(value)
}

const ToDbValueInput = z
  .object({
    dialect: Dialect,
    field: z
      .object({
        type: z.string().meta({ description: 'The Prisma field type.', example: 'DateTime' }),
        kind: z
          .string()
          .meta({ description: 'scalar, enum, object or unsupported.', example: 'scalar' }),
        isList: z.boolean().meta({ description: 'Whether the field is a list.', example: false }),
      })
      .readonly()
      .meta({ description: 'The Prisma field the value is written to.' }),
    value: Cell,
  })
  .readonly()
  .meta({ description: 'A JSON cell from the UI and the Prisma field it is written to' })

/** Converts a JSON cell into the value the driver binds for the field type and dialect. */
export function makeDbValue(input: z.infer<typeof ToDbValueInput>): unknown {
  const { dialect, field, value } = input
  if (value === null) return null
  if (field.isList) {
    if (dialect !== 'postgresql') return typeof value === 'string' ? value : JSON.stringify(value)
    try {
      return typeof value === 'string' ? JSON.parse(value) : value
    } catch {
      return value
    }
  }
  if (field.kind === 'enum') return String(value)
  switch (field.type) {
    case 'Int':
    case 'Float': {
      if (typeof value === 'number') return value
      if (typeof value === 'boolean') return value ? 1 : 0
      const parsed = Number(value)
      return Number.isNaN(parsed) ? value : parsed
    }
    case 'BigInt':
    case 'Decimal':
      return String(value)
    case 'Boolean': {
      const flag =
        typeof value === 'boolean'
          ? value
          : typeof value === 'number'
            ? value !== 0
            : value === 'true' || value === '1'
      return dialect === 'sqlite' ? (flag ? 1 : 0) : flag
    }
    case 'DateTime':
      return dialect === 'sqlite' ? String(value) : new Date(String(value))
    case 'Bytes':
      return Buffer.from(String(value), 'base64')
    default:
      return String(value)
  }
}

const RowFromDatabaseInput = z
  .object({
    row: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'The driver row keyed by column.' }),
    columnToField: z
      .custom<ReadonlyMap<string, string>>()
      .meta({ description: 'Column name to Prisma field name.' }),
    columnToEnum: z
      .custom<ReadonlyMap<string, ReadonlyMap<string, string>>>()
      .optional()
      .meta({ description: 'Column name to the Prisma name of each stored enum value.' }),
  })
  .readonly()
  .meta({ description: 'A driver row and the column → field name mapping' })

/** Renames columns back to field names, maps `@map`ped enum values back, and serializes every cell. */
export function makeRow(input: z.infer<typeof RowFromDatabaseInput>) {
  return Object.fromEntries(
    Object.entries(input.row).map(([column, value]) => {
      const named =
        typeof value === 'string' ? (input.columnToEnum?.get(column)?.get(value) ?? value) : value
      return [input.columnToField.get(column) ?? column, makeCell({ value: named })]
    }),
  )
}
