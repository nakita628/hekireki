// Syntax colouring of a Prisma Client call: Monaco tokenizes with a Monarch grammar, so this is
// the one place the query is read by pattern. It tells apart what a Prisma call is made of — the
// client, the model delegate, the operation, the argument keys and the values — where a plain
// TypeScript grammar colours every name the same. Everything that needs understanding
// (completion, hovers, signatures, type errors) comes from the project's TypeScript.
import type { languages } from 'monaco-editor/editor/editor.api.js'

export const QUERY_LANGUAGE_ID = 'prisma-client-query'

const KEYWORDS = ['await', 'new', 'async', 'const', 'let', 'return', 'typeof']

const LITERALS = ['true', 'false', 'null', 'undefined']

const IDENTIFIER = /[A-Za-z_$][\w$]*/u

/** The Monarch tokenizer for a Prisma Client call. */
export const QUERY_MONARCH: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.query',
  keywords: KEYWORDS,
  literals: LITERALS,
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],
  tokenizer: {
    root: [
      [/\/\/.*$/u, 'comment'],
      [/\/\*/u, 'comment', '@comment'],
      // `.findMany(`: an operation (or `$transaction`), called.
      [/(\.)(\$?[A-Za-z_][\w$]*)(?=\s*\()/u, ['delimiter', 'function']],
      // `.user`: a model delegate, or any other member.
      [/(\.)(\$?[A-Za-z_][\w$]*)/u, ['delimiter', 'member']],
      // `where:`: a key of an argument object.
      [/[A-Za-z_$][\w$]*(?=\s*:)/u, 'key'],
      [/(["'])(?:(?!\1)[^\\\n]|\\.)*\1(?=\s*:)/u, 'key'],
      // `Date` in `new Date(...)`, `Prisma` in `Prisma.DbNull`.
      [/[A-Z][\w$]*/u, 'type.identifier'],
      [
        IDENTIFIER,
        {
          cases: {
            prisma: 'variable.predefined',
            '@keywords': 'keyword',
            '@literals': 'keyword.literal',
            '@default': 'identifier',
          },
        },
      ],
      [/0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?/u, 'number'],
      [/(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?/u, 'number'],
      [/"([^"\\]|\\.)*$/u, 'string.invalid'],
      [/'([^'\\]|\\.)*$/u, 'string.invalid'],
      [/"/u, { token: 'string.quote', next: '@stringDouble' }],
      [/'/u, { token: 'string.quote', next: '@stringSingle' }],
      [/`/u, { token: 'string.quote', next: '@template' }],
      [/[{}()[\]]/u, '@brackets'],
      [/[=]>|\.\.\./u, 'operator'],
      [/[,:;.]/u, 'delimiter'],
      [/[-+*/%=<>!&|?]+/u, 'operator'],
      [/\s+/u, 'white'],
    ],
    comment: [
      [/[^*/]+/u, 'comment'],
      [/\*\//u, 'comment', '@pop'],
      [/[*/]/u, 'comment'],
    ],
    stringDouble: [
      [/[^\\"]+/u, 'string'],
      [/\\./u, 'string.escape'],
      [/"/u, { token: 'string.quote', next: '@pop' }],
    ],
    stringSingle: [
      [/[^\\']+/u, 'string'],
      [/\\./u, 'string.escape'],
      [/'/u, { token: 'string.quote', next: '@pop' }],
    ],
    template: [
      [/\$\{/u, { token: 'string.invalid', next: '@pop' }],
      [/[^\\`$]+/u, 'string'],
      [/\\./u, 'string.escape'],
      [/`/u, { token: 'string.quote', next: '@pop' }],
      [/\$/u, 'string'],
    ],
  },
}

/** Brackets, auto-closing pairs and comments of the query language. */
export const QUERY_LANGUAGE_CONFIGURATION: languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
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
    { open: "'", close: "'", notIn: ['string'] },
    { open: '`', close: '`', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  wordPattern: /-?\d*\.\d\w*|\$?[A-Za-z_][\w$]*/u,
}
