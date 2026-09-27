import { describe, expect, it } from 'vite-plus/test'

import { pascalCase, uniqueName } from './naming.js'

describe('pascalCase', () => {
  it.each([
    ['user', 'User'],
    ['bigNum', 'BigNum'],
    ['sku_code', 'SkuCode'],
    ['order_line_item', 'OrderLineItem'],
    ['snake__double', 'SnakeDouble'],
    ['already_Pascal', 'AlreadyPascal'],
    ['userID', 'UserID'],
    ['XMLHttp', 'XMLHttp'],
    ['AnotherModelWithAName', 'AnotherModelWithAName'],
    ['ID', 'Id'],
    ['PENDING_REVIEW', 'PendingReview'],
    ['FOO_BAR', 'FooBar'],
    ['link_only', 'LinkOnly'],
    ['v2_api', 'V2Api'],
    ['a1b2', 'A1b2'],
    ['Tag_', 'Tag'],
    ['_1st', '_1st'],
  ])('names %s %s', (name, expected) => {
    expect(pascalCase(name)).toBe(expected)
  })
})

describe('uniqueName', () => {
  it('keeps a free name', () => {
    expect(uniqueName('Tag', () => false)).toBe('Tag')
  })

  it('numbers a taken one from 1, as the scaffolder does', () => {
    const taken = new Set(['Tag', 'Tag1'])
    expect(uniqueName('Tag', (name) => taken.has(name))).toBe('Tag2')
  })
})
