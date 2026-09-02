import { StreamLanguage } from '@codemirror/language'
import type { StringStream } from '@codemirror/language'

const KEYWORDS = new Set(['model', 'enum', 'generator', 'datasource', 'type', 'view'])
const BUILTIN_TYPES = new Set([
  'String',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
  'Unsupported',
])

export type PrismaTokenState = {
  expectBlockName: boolean
  identifiersOnLine: number
}

export function prismaStartState(): PrismaTokenState {
  return { expectBlockName: false, identifiersOnLine: 0 }
}

// Token names are @lezer/highlight tag names, which StreamLanguage maps to styles.
export function prismaToken(stream: StringStream, state: PrismaTokenState): string | null {
  if (stream.sol()) {
    state.identifiersOnLine = 0
    state.expectBlockName = false
  }
  if (stream.eatSpace()) return null
  if (stream.match('//', true)) {
    stream.skipToEnd()
    return 'comment'
  }
  if (stream.match(/^"(?:[^"\\]|\\.)*"?/u, true)) return 'string'
  if (stream.match(/^@@?[\w.]+/u, true)) return 'attributeName'
  if (stream.match(/^\d+(?:\.\d+)?/u, true)) return 'number'
  if (stream.match(/^[A-Za-z_]\w*/u, true)) {
    const word = stream.current()
    const first = state.identifiersOnLine === 0
    state.identifiersOnLine += 1
    if (state.expectBlockName) {
      state.expectBlockName = false
      return 'className'
    }
    if (first && KEYWORDS.has(word) && stream.indentation() === 0) {
      state.expectBlockName = true
      return 'keyword'
    }
    if (word === 'true' || word === 'false' || word === 'null') return 'bool'
    if (first && stream.indentation() > 0) return 'propertyName'
    if (BUILTIN_TYPES.has(word) || /^[A-Z]/u.test(word)) return 'typeName'
    return 'variableName'
  }
  stream.next()
  return null
}

export const prismaLanguage = StreamLanguage.define<PrismaTokenState>({
  name: 'prisma',
  startState: prismaStartState,
  token: prismaToken,
  languageData: { commentTokens: { line: '//' } },
})
