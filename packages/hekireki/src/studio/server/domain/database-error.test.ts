import { describe, expect, it } from 'vite-plus/test'

import { makeDatabaseErrorMessage } from './database-error.js'

describe('makeDatabaseErrorMessage', () => {
  it('tells the user to migrate when a table is missing', () => {
    for (const message of [
      "Table 'studio.posts' doesn't exist",
      'relation "posts" does not exist',
      'no such table: posts',
    ]) {
      expect(makeDatabaseErrorMessage({ message })).toContain('prisma db push')
    }
  })

  it('tells the user to fill a required column', () => {
    expect(
      makeDatabaseErrorMessage({ message: "Field 'interests' doesn't have a default value" }),
    ).toContain('fill the field in')
    expect(
      makeDatabaseErrorMessage({ message: 'NOT NULL constraint failed: users.email' }),
    ).toContain('@default')
  })

  it('leaves other messages alone', () => {
    expect(makeDatabaseErrorMessage({ message: 'syntax error at or near "FROM"' })).toBe(
      'syntax error at or near "FROM"',
    )
  })
})
