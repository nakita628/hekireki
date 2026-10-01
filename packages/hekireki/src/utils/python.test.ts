import { describe, expect, it } from 'vite-plus/test'

import { jsonToPythonLiteral, toPythonString } from './python.js'

describe('toPythonString', () => {
  it('escapes what would end or break the literal', () => {
    expect(toPythonString('a "b" \\ c\nd\re')).toBe(String.raw`"a \"b\" \\ c\nd\re"`)
  })
})

describe('jsonToPythonLiteral', () => {
  it.each([
    [null, 'None'],
    [true, 'True'],
    [false, 'False'],
    [1.5, '1.5'],
    ['x', '"x"'],
    [[1, 'a', null], '[1, "a", None]'],
    [{ a: [true], 'b"': { c: 2 } }, '{"a": [True], "b\\"": {"c": 2}}'],
  ])('%j: %s', (value, expected) => {
    expect(jsonToPythonLiteral(value)).toBe(expected)
  })
})
