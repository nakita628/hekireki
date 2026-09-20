/**
 * Splits SQL text into statements at the `;` that sit outside quotes and comments. A driver runs
 * one statement per call, and the result a console shows belongs to the last one.
 */
export function splitStatements(text: string): readonly string[] {
  const ends: number[] = []
  let mode: 'code' | 'line-comment' | 'block-comment' | 'quoted' = 'code'
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    const next = text[index + 1] ?? ''
    if (mode === 'line-comment') {
      if (char === '\n') mode = 'code'
    } else if (mode === 'block-comment') {
      if (char === '*' && next === '/') {
        mode = 'code'
        index += 1
      }
    } else if (mode === 'quoted') {
      if (char === quote) {
        if (next === quote) {
          index += 1
        } else {
          mode = 'code'
          quote = ''
        }
      }
    } else if (char === '-' && next === '-') {
      mode = 'line-comment'
    } else if (char === '/' && next === '*') {
      mode = 'block-comment'
    } else if (char === "'" || char === '"' || char === '`') {
      mode = 'quoted'
      quote = char
    } else if (char === ';') {
      ends.push(index)
    }
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
