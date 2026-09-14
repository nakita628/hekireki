// The names Monaco's `languages.CompletionItemKind` has, as `keyof typeof` would list them.
const MONACO_KINDS = [
  'Method',
  'Function',
  'Constructor',
  'Field',
  'Variable',
  'Class',
  'Struct',
  'Interface',
  'Module',
  'Property',
  'Event',
  'Operator',
  'Unit',
  'Value',
  'Constant',
  'Enum',
  'EnumMember',
  'Keyword',
  'Text',
  'Color',
  'File',
  'Reference',
  'Customcolor',
  'Folder',
  'TypeParameter',
  'User',
  'Issue',
  'Snippet',
] as const

export type MonacoKindName = (typeof MONACO_KINDS)[number]

// TypeScript's `ScriptElementKind` strings, as the language service labels its completions.
const TYPESCRIPT_KINDS: ReadonlyMap<string, MonacoKindName> = new Map([
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
export function completionKindOf(kind: string): MonacoKindName {
  return TYPESCRIPT_KINDS.get(kind) ?? 'Text'
}

/** The Monaco kind of a schema-based suggestion, offered when there are no types to complete against. */
export function suggestionKindOf(
  kind: 'model' | 'operation' | 'argument' | 'field',
): MonacoKindName {
  return kind === 'model'
    ? 'Class'
    : kind === 'operation'
      ? 'Method'
      : kind === 'argument'
        ? 'Keyword'
        : 'Property'
}
