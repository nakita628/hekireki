type Cell = string | number | boolean | null

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cellOf(value: unknown): Cell {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return JSON.stringify(value)
}

/**
 * The result as a table, when it is one: an array of objects is a row per object, a single
 * object is one row, and a nested value (an included relation, an aggregate) is its JSON text in
 * the cell. Anything else — a count, a list of numbers, null — has no columns to show.
 */
export function tableOf(value: unknown) {
  const items = Array.isArray(value) ? value : [value]
  if (items.length === 0 || !items.every(isRecord)) return null
  const columns = [...new Set(items.flatMap((item) => Object.keys(item)))]
  const rows = items.map((item) =>
    Object.fromEntries(columns.map((column) => [column, cellOf(item[column])])),
  )
  return { columns, rows }
}

function parsedOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * What a failed request says: the `detail` of its problem body (hono's client keeps the body on
 * the error it throws), else the status line.
 */
export function problemMessage(error: unknown) {
  if (!(error instanceof Error)) return 'The query could not be run.'
  const detail: unknown = Reflect.get(error, 'detail')
  const data: unknown = isRecord(detail) ? detail.data : undefined
  const body = typeof data === 'string' ? parsedOf(data) : data
  return isRecord(body) && typeof body.detail === 'string' ? body.detail : error.message
}
