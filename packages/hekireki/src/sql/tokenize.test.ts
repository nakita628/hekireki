import { describe, expect, it } from 'vite-plus/test'

import { tokenize } from './tokenize.js'

function kinds(text: string) {
  const result = tokenize(text)
  if (!result.ok) throw new Error(result.error.message)
  return result.tokens.map((token) => `${token.kind}:${token.text}`)
}

describe('tokenize', () => {
  it('splits words, punctuation, operators and literals, keeping offsets', () => {
    const result = tokenize("SELECT a.b, 'x''y' FROM t WHERE c >= 1.5e3;")
    if (!result.ok) throw new Error(result.error.message)
    expect(
      result.tokens.map((token) => [token.kind, token.text, token.start, token.end]),
    ).toStrictEqual([
      ['word', 'SELECT', 0, 6],
      ['word', 'A', 7, 8],
      ['punct', '.', 8, 9],
      ['word', 'B', 9, 10],
      ['punct', ',', 10, 11],
      ['string', "x'y", 12, 18],
      ['word', 'FROM', 19, 23],
      ['word', 'T', 24, 25],
      ['word', 'WHERE', 26, 31],
      ['word', 'C', 32, 33],
      ['op', '>=', 34, 36],
      ['number', '1.5e3', 37, 42],
      ['punct', ';', 42, 43],
      ['eof', '', 43, 43],
    ])
  })

  it('keeps the raw spelling of a word and unquotes identifiers', () => {
    const result = tokenize('select "Mixed Case", `tick`, [bracket]')
    if (!result.ok) throw new Error(result.error.message)
    expect(
      result.tokens.slice(0, 6).map((token) => [token.kind, token.raw, token.text]),
    ).toStrictEqual([
      ['word', 'select', 'SELECT'],
      ['quoted', '"Mixed Case"', 'Mixed Case'],
      ['punct', ',', ','],
      ['quoted', '`tick`', 'tick'],
      ['punct', ',', ','],
      ['quoted', '[bracket]', 'bracket'],
    ])
  })

  it('reads every placeholder spelling, and tells :name from :: and @name from @>', () => {
    expect(kinds('? ?1 $1 :name @name x::int a @> b')).toStrictEqual([
      'param:?',
      'param:?1',
      'param:$1',
      'param::name',
      'param:@name',
      'word:X',
      'op:::',
      'word:INT',
      'word:A',
      'op:@>',
      'word:B',
      'eof:',
    ])
  })

  it('drops comments and reads dollar-quoted strings', () => {
    expect(kinds("-- line\nSELECT /* block */ $$a'b$$, $tag$c$tag$")).toStrictEqual([
      'word:SELECT',
      "string:a'b",
      'punct:,',
      'string:c',
      'eof:',
    ])
  })

  it('takes the longest operator', () => {
    expect(kinds("a ->> 'k' || b <> c != d")).toStrictEqual([
      'word:A',
      'op:->>',
      'string:k',
      'op:||',
      'word:B',
      'op:<>',
      'word:C',
      'op:!=',
      'word:D',
      'eof:',
    ])
  })

  it('reports where an unterminated string or comment starts', () => {
    expect(tokenize("SELECT 'open")).toStrictEqual({
      ok: false,
      error: { message: 'Unterminated string literal', offset: 7 },
    })
    expect(tokenize('SELECT /* open')).toStrictEqual({
      ok: false,
      error: { message: 'Unterminated block comment', offset: 7 },
    })
  })

  it('reads a subscript after a name as brackets, not a quoted identifier', () => {
    expect(kinds('arr[1]')).toStrictEqual(['word:ARR', 'punct:[', 'number:1', 'punct:]', 'eof:'])
  })
})
