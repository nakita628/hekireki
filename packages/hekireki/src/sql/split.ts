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
