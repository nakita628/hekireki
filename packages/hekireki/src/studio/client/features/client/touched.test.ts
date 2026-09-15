import { describe, expect, it } from 'vite-plus/test'

import { touchedHighlight } from './touched.js'

const MODELS = [
  {
    name: 'User',
    dbName: 'users',
    fields: [
      { name: 'id', dbName: null },
      { name: 'email', dbName: 'email_address' },
      { name: 'posts', dbName: null },
    ],
  },
  {
    name: 'Post',
    dbName: null,
    fields: [{ name: 'id' }, { name: 'authorId', dbName: 'author_id' }],
  },
]

describe('touchedHighlight', () => {
  it('names the tables and columns as the database does, lowercased', () => {
    expect(
      touchedHighlight(
        [
          { model: 'User', fields: ['email', 'posts'] },
          { model: 'Post', fields: ['authorId', 'id'] },
        ],
        MODELS,
      ),
    ).toStrictEqual(
      new Map([
        ['users', new Set(['email_address', 'posts'])],
        ['post', new Set(['author_id', 'id'])],
      ]),
    )
  })

  it('lights a model the call reaches without naming any of its fields', () => {
    expect(touchedHighlight([{ model: 'Post', fields: [] }], MODELS)).toStrictEqual(
      new Map([['post', new Set()]]),
    )
  })

  it('keeps a field the schema no longer has by the name the call gives it', () => {
    expect(touchedHighlight([{ model: 'User', fields: ['Nickname'] }], MODELS)).toStrictEqual(
      new Map([['users', new Set(['nickname'])]]),
    )
  })

  it('leaves every model lit when the call touches none the schema has', () => {
    expect(touchedHighlight([], MODELS)).toBeNull()
    expect(touchedHighlight([{ model: 'Ghost', fields: ['id'] }], MODELS)).toBeNull()
    expect(
      touchedHighlight(
        [
          { model: 'Ghost', fields: [] },
          { model: 'User', fields: [] },
        ],
        MODELS,
      ),
    ).toStrictEqual(new Map([['users', new Set()]]))
  })
})
