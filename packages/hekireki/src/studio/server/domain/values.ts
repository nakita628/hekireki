import * as z from 'zod'

const Dialect = z
  .enum(['postgresql', 'mysql', 'sqlite'])
  .meta({ description: 'The SQL dialect of the connected database', example: 'postgresql' })

const Cell = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .meta({ description: 'A JSON cell value as the UI sends and shows it' })

const MakeCellInput = z
  .object({ value: z.unknown().meta({ description: 'The raw driver value.' }) })
  .readonly()
  .meta({ description: 'Any value a database driver hands back' })

/**
 * Turns a driver value into a JSON cell: bigint and Date become strings, bytes base64, objects JSON text.
 *
 * @param input.value - the raw driver value
 * @returns the cell: a string, number, boolean or null
 * @example
 * makeCell({ value: 10n })
 * // '10'
 */
export function makeCell(input: z.infer<typeof MakeCellInput>) {
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

const MakeDbValueInput = z
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

/**
 * Converts a JSON cell into the value the driver binds for the field type and dialect.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.field - the Prisma field the value is written to: its type, kind and whether it is a list
 * @param input.value - the JSON cell as the UI sends it
 * @returns the value the driver binds
 * @example
 * makeDbValue({ dialect: 'sqlite', field: { type: 'Boolean', kind: 'scalar', isList: false }, value: true })
 * // 1
 */
export function makeDbValue(input: z.infer<typeof MakeDbValueInput>): unknown {
  const { dialect, field, value } = input
  if (value === null) return null
  if (field.isList) return listDbValue(dialect, value)
  if (field.kind === 'enum') return String(value)
  switch (field.type) {
    case 'Int':
    case 'Float':
      return numberDbValue(value)
    case 'BigInt':
    case 'Decimal':
      return String(value)
    case 'Boolean': {
      const flag = flagOf(value)
      if (dialect !== 'sqlite') return flag
      return flag ? 1 : 0
    }
    case 'DateTime':
      return dialect === 'sqlite' ? String(value) : new Date(String(value))
    case 'Bytes':
      return Buffer.from(String(value), 'base64')
    default:
      return String(value)
  }
}

type DbCell = string | number | boolean

// PostgreSQL binds a list as an array, parsed from the JSON text the UI edits; the others store
// the JSON text.
function listDbValue(dialect: z.infer<typeof Dialect>, value: DbCell): unknown {
  if (dialect !== 'postgresql') return typeof value === 'string' ? value : JSON.stringify(value)
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return value
  }
}

// A number as the driver binds it; text that is not a number is passed on for the database to refuse.
function numberDbValue(value: DbCell) {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  const result = Number(value)
  return Number.isNaN(result) ? value : result
}

// Whether a cell means true: a boolean as it is, a number other than 0, or the text `true` or `1`.
function flagOf(value: DbCell) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return value === 'true' || value === '1'
}

const MakeRowInput = z
  .object({
    row: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'The driver row keyed by column.' }),
    columnToField: z
      .map(z.string(), z.string())
      .meta({ description: 'Column name to Prisma field name.' }),
    columnToEnum: z
      .map(z.string(), z.map(z.string(), z.string()))
      .optional()
      .meta({ description: 'Column name to the Prisma name of each stored enum value.' }),
  })
  .readonly()
  .meta({ description: 'A driver row and the column → field name mapping' })

/**
 * Renames columns back to field names, maps `@map`ped enum values back, and serializes every cell.
 *
 * @param input.row - the driver row keyed by column
 * @param input.columnToField - column name to Prisma field name
 * @param input.columnToEnum - column name to the Prisma name of each stored enum value
 * @returns the row keyed by field name, every value a JSON cell
 * @example
 * makeRow({
 *   row: { created_at: new Date('2026-01-02T03:04:05Z'), role: 'admin' },
 *   columnToField: new Map([['created_at', 'createdAt']]),
 *   columnToEnum: new Map([['role', new Map([['admin', 'ADMIN']])]]),
 * })
 * // { createdAt: '2026-01-02T03:04:05.000Z', role: 'ADMIN' }
 */
export function makeRow(input: z.infer<typeof MakeRowInput>) {
  return Object.fromEntries(
    Object.entries(input.row).map(([column, value]) => {
      const named =
        typeof value === 'string' ? (input.columnToEnum?.get(column)?.get(value) ?? value) : value
      return [input.columnToField.get(column) ?? column, makeCell({ value: named })]
    }),
  )
}

const MakeBindValueInput = z
  .object({
    dialect: Dialect,
    value: Cell,
  })
  .readonly()
  .meta({
    description: 'A parameter value from the client and the dialect it is bound for',
    example: { dialect: 'sqlite', value: 1 },
  })

/**
 * The driver value for a JSON parameter: SQLite has no booleans, so they bind as 0 / 1.
 *
 * @param input.dialect - the dialect the value is bound for
 * @param input.value - the parameter value from the client
 * @returns the value to bind
 * @example
 * makeBindValue({ dialect: 'sqlite', value: true })
 * // 1
 */
export function makeBindValue(input: z.infer<typeof MakeBindValueInput>) {
  if (typeof input.value === 'boolean' && input.dialect === 'sqlite') return input.value ? 1 : 0
  return input.value
}
