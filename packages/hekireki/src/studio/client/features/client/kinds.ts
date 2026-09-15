import type { languages } from 'monaco-editor/editor/editor.api.js'

// TypeScript's `ScriptElementKind` strings, as the language service labels its completions.
const TYPESCRIPT_KINDS: ReadonlyMap<string, keyof typeof languages.CompletionItemKind> = new Map([
  ['method', 'Method'],
  ['function', 'Function'],
  ['local function', 'Function'],
  ['construct', 'Constructor'],
  ['constructor', 'Constructor'],
  ['property', 'Property'],
  ['getter', 'Property'],
  ['setter', 'Property'],
  ['var', 'Variable'],
  ['let', 'Variable'],
  ['const', 'Constant'],
  ['local var', 'Variable'],
  ['parameter', 'Variable'],
  ['alias', 'Variable'],
  ['class', 'Class'],
  ['local class', 'Class'],
  ['interface', 'Interface'],
  ['type', 'Struct'],
  ['primitive type', 'Struct'],
  ['type parameter', 'TypeParameter'],
  ['enum', 'Enum'],
  ['enum member', 'EnumMember'],
  ['module', 'Module'],
  ['external_module', 'Module'],
  ['keyword', 'Keyword'],
  ['string', 'Text'],
  ['directory', 'Folder'],
  ['script', 'File'],
])

/** The Monaco kind a TypeScript completion shows with; anything unfamiliar is plain text. */
export function completionKindOf(kind: string) {
  return TYPESCRIPT_KINDS.get(kind) ?? 'Text'
}
