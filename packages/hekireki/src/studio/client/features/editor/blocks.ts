import { symbolKindName } from './lsp.js'

// The blocks that hold data, as the language server's outline kinds them: models and views are
// classes, enums enums, composite types interfaces; datasources and generators are neither.
const DATA_KINDS = new Set(['Class', 'Enum', 'Interface'])

/**
 * The model, enum or type whose block contains the 1-based line, or null between blocks.
 *
 * @param symbols - the blocks of the file, as the language server's document outline lists them
 */
export function blockAtLine(
  symbols: readonly {
    readonly name: string
    readonly kind: number
    readonly range: {
      readonly start: { readonly line: number }
      readonly end: { readonly line: number }
    }
  }[],
  line: number,
) {
  return (
    symbols
      .filter((symbol) => DATA_KINDS.has(symbolKindName(symbol.kind)))
      .map((symbol) => ({
        kind: symbolKindName(symbol.kind),
        name: symbol.name,
        start: symbol.range.start.line + 1,
        end: symbol.range.end.line + 1,
      }))
      .find((block) => line >= block.start && line <= block.end) ?? null
  )
}
