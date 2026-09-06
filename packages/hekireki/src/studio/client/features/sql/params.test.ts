import { describe, expect, it } from 'vite-plus/test'

import { bindValues, defaultParamInput, paramKey, parseParamInput } from './params.js'

function parameter(tsType: string, nullable: boolean | null = null, placeholder = '?', index = 0) {
  return { index, placeholder, tsType, nullable }
}

describe('parseParamInput', () => {
  it('binds NULL for the literal, whatever the type', () => {
    expect(parseParamInput(parameter('number'), 'NULL')).toBeNull()
    expect(parseParamInput(parameter('string'), ' NULL ')).toBeNull()
  })

  it('binds NULL for an empty field only when the parameter is nullable', () => {
    expect(parseParamInput(parameter('string', true), '')).toBeNull()
    expect(parseParamInput(parameter('string', false), '')).toBe('')
    expect(parseParamInput(parameter('string', null), '')).toBe('')
  })

  it('parses a number and falls back to the text when the digits do not parse', () => {
    expect(parseParamInput(parameter('number'), ' 42 ')).toBe(42)
    expect(parseParamInput(parameter('number'), '-1.5')).toBe(-1.5)
    expect(parseParamInput(parameter('number'), 'abc')).toBe('abc')
    expect(parseParamInput(parameter('number'), '')).toBe('')
  })

  it('reads a boolean from true / false / 1 / 0', () => {
    expect(parseParamInput(parameter('boolean'), 'true')).toBe(true)
    expect(parseParamInput(parameter('boolean'), '1')).toBe(true)
    expect(parseParamInput(parameter('boolean'), 'false')).toBe(false)
    expect(parseParamInput(parameter('boolean'), '0')).toBe(false)
    expect(parseParamInput(parameter('boolean'), 'yes')).toBe(false)
  })

  it('binds everything else as the text it was given, untrimmed', () => {
    expect(parseParamInput(parameter('string'), ' a ')).toBe(' a ')
    expect(parseParamInput(parameter('unknown'), '12')).toBe('12')
  })
})

describe('defaultParamInput', () => {
  it('offers a sample the type accepts', () => {
    expect(defaultParamInput(parameter('number'))).toBe('1')
    expect(defaultParamInput(parameter('boolean'))).toBe('true')
    expect(defaultParamInput(parameter('string'))).toBe('')
    expect(defaultParamInput(parameter('Date'))).toBe('')
  })
})

describe('paramKey', () => {
  it('remembers a named placeholder by its name and a positional one by its index', () => {
    expect(paramKey(parameter('string', null, ':name', 3))).toBe(':name')
    expect(paramKey(parameter('string', null, '@p', 3))).toBe('@p')
    expect(paramKey(parameter('string', null, '$user_id', 3))).toBe('$user_id')
    expect(paramKey(parameter('string', null, '?', 3))).toBe('#3')
    expect(paramKey(parameter('string', null, '$1', 3))).toBe('#3')
  })
})

describe('bindValues', () => {
  it('binds one value per parameter, in order, from the inputs or the defaults', () => {
    const parameters = [
      parameter('number', null, '$1', 0),
      parameter('string', null, ':name', 1),
      parameter('boolean', null, '?', 2),
    ]
    expect(bindValues(parameters, { '#0': '7', ':name': 'ann' })).toStrictEqual([7, 'ann', true])
    expect(bindValues(parameters, {})).toStrictEqual([1, '', true])
  })
})
