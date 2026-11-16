/**
 * Splits SQL text into statements at the `;` that sit outside quotes and comments. A driver runs
 * one statement per call, and the result a console shows belongs to the last one.
 */
export function splitStatements(text: string): readonly string[] {
  const ends: number[] = []
  let mode: Mode = 'code'
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const scanned = scan(mode, quote, text[index] ?? '', text[index + 1] ?? '')
    mode = scanned.mode
    quote = scanned.quote
    if (scanned.end) ends.push(index)
    if (scanned.skip) index += 1
  }
  const bounds = [...ends, text.length]
  return bounds
    .map((end, index) => text.slice(index === 0 ? 0 : (bounds[index - 1] ?? 0) + 1, end).trim())
    .filter((statement) => statement !== '')
}

/**
 * Splits at the commas outside parentheses and quotes: the clauses of an ALTER TABLE, the items
 * of a list.
 */
export function splitTopLevel(text: string): readonly string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote = ''
  for (const char of text) {
    current += char
    if (quote !== '') {
      if (char === quote) quote = ''
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char
    } else if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
    } else if (char === ',' && depth === 0) {
      parts.push(current.slice(0, -1).trim())
      current = ''
    }
  }
  return [...parts, current.trim()].filter((part) => part !== '')
}

type Mode = 'code' | 'line-comment' | 'block-comment' | 'quoted'

/** One character read: the mode after it, whether the next character goes with it, whether a statement ends there. */
type Scanned = {
  readonly mode: Mode
  readonly quote: string
  readonly skip: boolean
  readonly end: boolean
}

function scan(mode: Mode, quote: string, char: string, next: string): Scanned {
  if (mode === 'line-comment') {
    return { mode: char === '\n' ? 'code' : mode, quote, skip: false, end: false }
  }
  if (mode === 'block-comment') {
    const closes = char === '*' && next === '/'
    return { mode: closes ? 'code' : mode, quote, skip: closes, end: false }
  }
  if (mode === 'quoted') return scanQuoted(quote, char, next)
  return scanCode(char, next)
}

function scanQuoted(quote: string, char: string, next: string): Scanned {
  // A doubled quote is the quote character itself and keeps the string open.
  if (char === quote && next === quote) return { mode: 'quoted', quote, skip: true, end: false }
  if (char === quote) return { mode: 'code', quote: '', skip: false, end: false }
  return { mode: 'quoted', quote, skip: false, end: false }
}

function scanCode(char: string, next: string): Scanned {
  if (char === '-' && next === '-') {
    return { mode: 'line-comment', quote: '', skip: false, end: false }
  }
  if (char === '/' && next === '*') {
    return { mode: 'block-comment', quote: '', skip: false, end: false }
  }
  if (char === "'" || char === '"' || char === '`') {
    return { mode: 'quoted', quote: char, skip: false, end: false }
  }
  return { mode: 'code', quote: '', skip: false, end: char === ';' }
}
