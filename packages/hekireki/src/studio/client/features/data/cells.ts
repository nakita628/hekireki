type Row = Record<string, string | number | boolean | null>

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
}

export function displayCell(value: Row[string]) {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function editableText(value: Row[string]) {
  return value === null
    ? ''
    : typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : String(value)
}

// Turns what the user typed into the JSON value the data API expects for the field.
export function parseCellInput(field: Field, text: string): Row[string] {
  if (text === '' && !field.isRequired) return null
  if (text === 'NULL' && !field.isRequired) return null
  if (field.kind === 'enum' || field.isList) return text
  switch (field.type) {
    case 'Int':
    case 'Float': {
      const parsed = Number(text)
      return text.trim() !== '' && !Number.isNaN(parsed) ? parsed : text
    }
    case 'Boolean':
      return text === 'true' || text === '1'
    default:
      return text
  }
}

export function keyOf(row: Row, key: readonly string[]): Row {
  return Object.fromEntries(key.map((name) => [name, row[name] ?? null]))
}

function escapeCsv(value: Row[string]) {
  const text = value === null ? '' : String(value)
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(columns: readonly string[], rows: readonly Row[]) {
  const escape = escapeCsv
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((c) => escape(row[c] ?? null)).join(',')),
  ].join('\n')
}
