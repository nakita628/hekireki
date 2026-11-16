import { describe, expect, it } from 'vite-plus/test'

import { jsonToPythonLiteral, pythonDocstringLines, toPythonString } from './python.js'

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

describe('pythonDocstringLines', () => {
  it('is no lines without prose', () => {
    expect(pythonDocstringLines(undefined, '    ')).toStrictEqual([])
  })
  it('keeps one line on one line', () => {
    expect(pythonDocstringLines('The key.', '    ')).toStrictEqual(['    """The key."""'])
  })
  it('closes several lines on a line of its own and leaves a blank line empty', () => {
    expect(pythonDocstringLines('First.\n\nSecond.', '    ')).toStrictEqual([
      '    """First.',
      '',
      '    Second.',
      '    """',
    ])
  })
  it('cannot be closed early or read as an escape sequence', () => {
    expect(pythonDocstringLines(String.raw`a """ b \n c"`, '')).toStrictEqual([
      String.raw`"""a \"\"" b \\n c\""""`,
    ])
  })
})
