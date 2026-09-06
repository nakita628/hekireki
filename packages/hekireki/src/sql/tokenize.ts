/**
 * The SQL tokenizer: source text in, a flat list of tokens with their offsets out. Every token
 * remembers where it came from, so the analysis can point the editor at a clause, and every
 * bare word is a `word` — the parser decides which ones are keywords in the position they sit
 * in, because `first`, `rows` or `window` are keywords in one clause and column names in another.
 */

export type TokenKind = 'word' | 'quoted' | 'string' | 'number' | 'param' | 'op' | 'punct' | 'eof'

export type Token = {
  readonly kind: TokenKind
  /** The token as written, quotes included. */
  readonly raw: string
  /** The value: a word uppercased, a quoted identifier or string unquoted, an operator as is. */
  readonly text: string
  readonly start: number
  readonly end: number
}

export type TokenizeError = { readonly message: string; readonly offset: number }

export type TokenizeResult =
  | { readonly ok: true; readonly tokens: readonly Token[] }
  | { readonly ok: false; readonly error: TokenizeError }

// Longest first, so `->>` wins over `->` and `<=` over `<`.
const OPERATORS = [
  '->>',
  '#>>',
  '!~*',
  '<=>',
  '||',
  '::',
  '->',
  '#>',
  '@>',
  '<@',
  '<>',
  '!=',
  '<=',
  '>=',
  '~*',
  '!~',
  '<<',
  '>>',
  '**',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '=',
  '~',
  '^',
  '&',
  '|',
  '!',
  '#',
] as const

const PUNCTUATION = new Set(['(', ')', ',', ';', '.', '[', ']'])

const WORD_START = /[A-Za-z_À-￿]/u
const WORD_CHAR = /[A-Za-z0-9_$À-￿]/u
const NUMBER = /^(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/u
const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/u

function isWordStart(char: string) {
  return WORD_START.test(char)
}

function isWordChar(char: string) {
  return WORD_CHAR.test(char)
}

function isDigit(char: string) {
  return char >= '0' && char <= '9'
}

function isSpace(char: string) {
  return char === ' ' || char === '\n' || char === '\t' || char === '\r' || char === '\f'
}

/** The end of a delimited run (`'...'` with `''` escapes, `"..."`, backticks, `[...]`); null when unterminated. */
function readDelimited(text: string, from: number, close: string, doubled: boolean) {
  for (let at = from + 1; at < text.length; at += 1) {
    if (text[at] === close) {
      if (doubled && text[at + 1] === close) {
        at += 1
      } else {
        return at + 1
      }
    }
  }
  return null
}

function readNumber(text: string, from: number) {
  const match = NUMBER.exec(text.slice(from))?.[0] ?? ''
  return from + match.length
}

function readWord(text: string, from: number) {
  let at = from
  while (at < text.length && isWordChar(text[at] ?? '')) at += 1
  return at
}

/** `$$...$$` or `$tag$...$tag$`: PostgreSQL's dollar quoting. Null when this `$` is not one. */
function readDollarQuoted(text: string, from: number) {
  const tag = DOLLAR_TAG.exec(text.slice(from))?.[0]
  if (tag === undefined) return null
  const close = text.indexOf(tag, from + tag.length)
  return close === -1 ? null : { end: close + tag.length, tag }
}

function unquote(raw: string, close: string, doubled: boolean) {
  const inner = raw.slice(1, -1)
  return doubled ? inner.replaceAll(close + close, close) : inner
}

/** Whether a `[` opens a quoted identifier (`[name]`) rather than subscripting the expression before it. */
function isBracketIdentifier(previous: Token | null) {
  if (previous === null) return true
  if (previous.kind === 'word' || previous.kind === 'quoted' || previous.kind === 'param') {
    return false
  }
  return previous.raw !== ')' && previous.raw !== ']'
}

type Step =
  | { readonly token: Token; readonly next: number }
  | { readonly skip: number }
  | { readonly error: TokenizeError }

function token(kind: TokenKind, raw: string, text: string, start: number, end: number): Step {
  return { token: { kind, raw, text, start, end }, next: end }
}

function step(text: string, at: number, previous: Token | null): Step {
  const char = text[at] ?? ''
  if (isSpace(char)) return { skip: at + 1 }
  if (char === '-' && text[at + 1] === '-') {
    const end = text.indexOf('\n', at)
    return { skip: end === -1 ? text.length : end + 1 }
  }
  if (char === '/' && text[at + 1] === '*') {
    const end = text.indexOf('*/', at + 2)
    if (end === -1) return { error: { message: 'Unterminated block comment', offset: at } }
    return { skip: end + 2 }
  }
  if (char === "'") {
    const end = readDelimited(text, at, "'", true)
    if (end === null) return { error: { message: 'Unterminated string literal', offset: at } }
    const raw = text.slice(at, end)
    return token('string', raw, unquote(raw, "'", true), at, end)
  }
  if (char === '"' || char === '`') {
    const end = readDelimited(text, at, char, true)
    if (end === null) return { error: { message: 'Unterminated quoted identifier', offset: at } }
    const raw = text.slice(at, end)
    return token('quoted', raw, unquote(raw, char, true), at, end)
  }
  if (char === '[' && isBracketIdentifier(previous)) {
    const end = readDelimited(text, at, ']', false)
    if (end === null) return { error: { message: 'Unterminated quoted identifier', offset: at } }
    const raw = text.slice(at, end)
    return token('quoted', raw, unquote(raw, ']', false), at, end)
  }
  if (char === '$') {
    const dollar = readDollarQuoted(text, at)
    if (dollar !== null) {
      const raw = text.slice(at, dollar.end)
      return token('string', raw, raw.slice(dollar.tag.length, -dollar.tag.length), at, dollar.end)
    }
    const end = readWord(text, at + 1)
    if (end > at + 1) return token('param', text.slice(at, end), text.slice(at, end), at, end)
  }
  if (char === '?') {
    const end = readWord(text, at + 1)
    return token('param', text.slice(at, end), text.slice(at, end), at, end)
  }
  // `:name` / `@name` are named placeholders; `::` is a cast and `@>` an operator.
  if (
    (char === ':' || char === '@') &&
    previous?.raw !== ':' &&
    text[at + 1] !== ':' &&
    isWordStart(text[at + 1] ?? '')
  ) {
    const end = readWord(text, at + 1)
    return token('param', text.slice(at, end), text.slice(at, end), at, end)
  }
  if (isDigit(char) || (char === '.' && isDigit(text[at + 1] ?? ''))) {
    const end = readNumber(text, at)
    return token('number', text.slice(at, end), text.slice(at, end), at, end)
  }
  if (isWordStart(char)) {
    const end = readWord(text, at)
    const raw = text.slice(at, end)
    return token('word', raw, raw.toUpperCase(), at, end)
  }
  if (PUNCTUATION.has(char)) return token('punct', char, char, at, at + 1)
  const operator = OPERATORS.find((candidate) => text.startsWith(candidate, at))
  if (operator !== undefined) {
    return token('op', operator, operator, at, at + operator.length)
  }
  return { error: { message: `Unexpected character "${char}"`, offset: at } }
}

/** Splits SQL text into tokens; comments and whitespace are dropped, offsets are kept. */
export function tokenize(text: string): TokenizeResult {
  const tokens: Token[] = []
  let at = 0
  while (at < text.length) {
    const result = step(text, at, tokens.at(-1) ?? null)
    if ('error' in result) return { ok: false, error: result.error }
    if ('skip' in result) {
      at = result.skip
    } else {
      tokens.push(result.token)
      at = result.next
    }
  }
  tokens.push({ kind: 'eof', raw: '', text: '', start: text.length, end: text.length })
  return { ok: true, tokens }
}
