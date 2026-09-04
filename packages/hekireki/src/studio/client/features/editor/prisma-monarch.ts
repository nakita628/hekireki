// Syntax colouring only: Monaco tokenizes with a Monarch grammar, so this is the one place a
// Prisma schema is read by pattern. Everything that needs understanding (diagnostics, symbols,
// completions, definitions, renames) comes from the Prisma language server.
import type { languages } from 'monaco-editor/editor/editor.api.js'

export const PRISMA_LANGUAGE_ID = 'prisma'

const BLOCK_KEYWORDS = ['model', 'enum', 'generator', 'datasource', 'type', 'view']

const BUILTIN_TYPES = [
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
  'Unsupported',
]

/** The word a completion replaces: an attribute with its `@` / `@@`, or an identifier with dots. */
export const WORD_PATTERN = /@{1,2}[A-Za-z_][\w.]*|@{1,2}|[A-Za-z_][\w.]*/u

/** The Monarch tokenizer for Prisma schemas, mirroring the VS Code extension's colouring. */
export const PRISMA_MONARCH: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.prisma',
  keywords: BLOCK_KEYWORDS,
  types: BUILTIN_TYPES,
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],
  tokenizer: {
    root: [
      [/\/\/\/.*$/u, 'comment.doc'],
      [/\/\/.*$/u, 'comment'],
      // A block header: the keyword and the name it declares, before its `{`.
      [
        /^(\s*)(model|enum|generator|datasource|type|view)(\s+)([A-Za-z_][\w-]*)(?=\s*\{)/u,
        ['white', 'keyword', 'white', 'type.identifier'],
      ],
      // A field line: the field name and its type.
      [
        /^(\s*)([A-Za-z_]\w*)(\s+)([A-Za-z_]\w*)/u,
        [
          'white',
          'identifier',
          'white',
          { cases: { '@types': 'type', '@default': 'type.identifier' } },
        ],
      ],
      // `@` is Monarch's attribute marker, so the literal one is spelled as a class.
      [/[@]{1,2}[A-Za-z_][\w.]*/u, 'annotation'],
      [/"([^"\\]|\\.)*$/u, 'string.invalid'],
      [/"/u, { token: 'string.quote', next: '@string' }],
      [/\d+(\.\d+)?/u, 'number'],
      [/[A-Za-z_]\w*(?=\s*\()/u, 'function'],
      [
        /[A-Za-z_]\w*/u,
        { cases: { '@types': 'type', '@keywords': 'keyword', '@default': 'identifier' } },
      ],
      [/[{}()[\]]/u, '@brackets'],
      [/[?=:,.]/u, 'delimiter'],
      [/\s+/u, 'white'],
    ],
    string: [
      [/[^\\"]+/u, 'string'],
      [/\\./u, 'string.escape'],
      [/"/u, { token: 'string.quote', next: '@pop' }],
    ],
  },
}

/** Brackets, comments and auto-closing pairs of a Prisma schema. */
export const PRISMA_LANGUAGE_CONFIGURATION: languages.LanguageConfiguration = {
  comments: { lineComment: '//' },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  wordPattern: WORD_PATTERN,
}
