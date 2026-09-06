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

/**
 * What the table calls this row. The primary key where the model has one, and otherwise every
 * column of it: selection, the React key and the delete dialog all have to name the same row,
 * and a page of a keyless model still has to draw without two rows colliding.
 */
export function rowId(row: Row, key: readonly string[]) {
  return JSON.stringify(keyOf(row, key))
}

/** `id = 3, email = "a@b.c"` — the row as the delete dialog names it. */
export function keyLabel(row: Row, key: readonly string[]) {
  return key.map((name) => `${name} = ${displayCell(row[name] ?? null)}`).join(', ')
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

/**
 * The rows as a spreadsheet pastes them. Tabs and newlines inside a value would end the cell or
 * the row, so they are written as spaces rather than quoted: TSV has no quoting to speak of, and
 * a broken paste is worse than a flattened one.
 */
function flattenTsv(value: Row[string]) {
  return value === null ? '' : String(value).replaceAll(/[\t\n\r]/gu, ' ')
}

export function toTsv(columns: readonly string[], rows: readonly Row[]) {
  return [
    columns.join('\t'),
    ...rows.map((row) => columns.map((c) => flattenTsv(row[c] ?? null)).join('\t')),
  ].join('\n')
}

export function toJson(columns: readonly string[], rows: readonly Row[]) {
  return JSON.stringify(
    rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))),
    null,
    2,
  )
}

/**
 * The text split into what a case-insensitive search for `query` matched and what it did not, so
 * a hit in the fourteenth column can be seen rather than hunted for. An empty query matches
 * nothing: the whole page would light up, which says no more than leaving it plain.
 */
export function matchRuns(text: string, query: string) {
  const needle = query.trim().toLowerCase()
  if (needle === '' || text === '') return [{ start: 0, text, matched: false }]
  // Splitting on the needle leaves the untouched runs; the seam between two of them is a hit.
  const between = text.toLowerCase().split(needle)
  return between.flatMap((part, index) => {
    const start = between
      .slice(0, index)
      .reduce((offset, earlier) => offset + earlier.length + needle.length, 0)
    const hit = start + part.length
    const plain = { start, text: text.slice(start, hit), matched: false }
    const marked = { start: hit, text: text.slice(hit, hit + needle.length), matched: true }
    // The text after the last seam is trailing, not a hit; an empty run between two hits is not
    // a run at all.
    const last = index === between.length - 1
    if (part === '') return last ? [] : [marked]
    return last ? [plain] : [plain, marked]
  })
}
