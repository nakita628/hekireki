import * as z from 'zod'

// What a Prisma Client call resolved to, written as JSON for the page, and the values a query
// event says it bound.

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function'
}

function jsonOf(value: unknown): JsonValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  if (Array.isArray(value)) return value.map((item: unknown) => jsonOf(item))
  if (typeof value !== 'object') return null
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype === Object.prototype || prototype === null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonOf(item)]))
  }
  // A Decimal (and anything else with a JSON form of its own) says how it wants to be written.
  const toJson: unknown = Reflect.get(value, 'toJSON')
  const written: unknown = isFunction(toJson) ? Reflect.apply(toJson, value, []) : null
  return typeof written === 'object' ? null : jsonOf(written)
}

const MakeClientResultInput = z
  .object({
    value: z.unknown().meta({ description: 'What the Prisma Client call resolved to.' }),
    limit: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'The most rows of an array result to keep.', example: 500 }),
  })
  .readonly()
  .meta({ description: 'A Prisma Client result to send as JSON' })

/**
 * The result as JSON (dates as ISO strings, bigints and decimals as strings, bytes as base64),
 * an array cut to its first rows, with the length it had.
 *
 * @param input - the value and how many rows of an array to keep
 * @returns the JSON value, the array length (null for anything else) and whether it was cut
 */
export function makeClientResult(input: z.infer<typeof MakeClientResultInput>) {
  const { value, limit } = input
  if (!Array.isArray(value)) return { result: jsonOf(value), rowCount: null, truncated: false }
  return {
    result: value.slice(0, limit).map((item: unknown) => jsonOf(item)),
    rowCount: value.length,
    truncated: value.length > limit,
  }
}

const MakeSqlParamsInput = z
  .object({
    text: z.string().meta({
      description: 'The params of a Prisma query event, as JSON text.',
      example: '["ann",10,0]',
    }),
  })
  .readonly()
  .meta({ description: 'The params Prisma logged for a statement', example: { text: '[1]' } })

/** The logged params as JSON cells; a value that is not a cell is its JSON text, text that is not JSON is dropped. */
export function makeSqlParams(input: z.infer<typeof MakeSqlParamsInput>) {
  const result = ((): unknown => {
    try {
      return JSON.parse(input.text)
    } catch {
      return []
    }
  })()
  return (Array.isArray(result) ? result : []).map((item: unknown) =>
    item === null ||
    typeof item === 'string' ||
    typeof item === 'number' ||
    typeof item === 'boolean'
      ? item
      : JSON.stringify(item),
  )
}
