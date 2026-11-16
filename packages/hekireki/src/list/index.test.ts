import { describe, expect, it } from 'vite-plus/test'

import { chunks, isSameList } from './index.js'

describe('isSameList', () => {
  it.each([
    [['a', 'b'], ['a', 'b'], true],
    [['a', 'b'], ['b', 'a'], false],
    [['a'], ['a', 'b'], false],
    [[], [], true],
  ])('%j and %j: %s', (left, right, expected) => {
    expect(isSameList(left, right)).toBe(expected)
  })
})

describe('chunks', () => {
  it('cuts the items into runs of at most the size, in order', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toStrictEqual([[1, 2], [3, 4], [5]])
    expect(chunks([1, 2], 5)).toStrictEqual([[1, 2]])
    expect(chunks([], 3)).toStrictEqual([])
  })
})
