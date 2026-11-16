import { describe, expect, it } from 'vite-plus/test'

import { getBool, getString, getStrings } from './config.js'

describe('getString', () => {
  it('returns string when given a string', () => {
    expect(getString('hello')).toBe('hello')
  })
  it('returns first element when given an array', () => {
    expect(getString(['first', 'second'])).toBe('first')
  })
  it('returns undefined when given undefined', () => {
    expect(getString(undefined)).toBeUndefined()
  })
  it('returns undefined when the array is empty', () => {
    expect(getString([])).toBeUndefined()
  })
})

describe('getStrings', () => {
  it('wraps a lone string in a list', () => {
    expect(getStrings('er.md')).toStrictEqual(['er.md'])
  })
  it('returns the list it was given, empty or not', () => {
    expect(getStrings(['er.md', 'er.svg'])).toStrictEqual(['er.md', 'er.svg'])
    expect(getStrings([])).toStrictEqual([])
  })
  it('returns undefined when there is no value', () => {
    expect(getStrings(undefined)).toBeUndefined()
  })
})

describe('getBool', () => {
  it('returns true for boolean true', () => {
    expect(getBool(true)).toBe(true)
  })
  it('returns true for string "true"', () => {
    expect(getBool('true')).toBe(true)
  })
  it('returns true for array with "true"', () => {
    expect(getBool(['true'])).toBe(true)
  })
  it('returns fallback for undefined', () => {
    expect(getBool(undefined)).toBe(false)
  })
  it('returns custom fallback', () => {
    expect(getBool(undefined, true)).toBe(true)
  })
  it('returns fallback for false', () => {
    expect(getBool(false)).toBe(false)
  })
})
