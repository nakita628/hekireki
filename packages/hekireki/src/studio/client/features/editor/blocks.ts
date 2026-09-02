const BLOCK_HEADER = /^\s*(model|enum|type|view)\s+(\w+)\s*\{/u

export function blockRange(lines: readonly string[], startLine: number) {
  const end = lines.findIndex((line, index) => index >= startLine - 1 && /^\}\s*$/u.test(line))
  return { start: startLine, end: end === -1 ? lines.length : end + 1 }
}

// Name of the model or enum whose block contains the 1-based line, or null between blocks.
export function blockAtLine(text: string, line: number) {
  const lines = text.split('\n')
  const headers = lines.flatMap((current, index) => {
    const match = BLOCK_HEADER.exec(current)
    return match ? [{ kind: match[1] ?? '', name: match[2] ?? '', start: index + 1 }] : []
  })
  return (
    headers
      .map((header) => {
        const range = blockRange(lines, header.start)
        return { kind: header.kind, name: header.name, start: range.start, end: range.end }
      })
      .find((block) => line >= block.start && line <= block.end) ?? null
  )
}
