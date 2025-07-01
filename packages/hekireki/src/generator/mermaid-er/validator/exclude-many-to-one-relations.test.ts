import { describe, expect, it } from 'vitest'
import { excludeManyToOneRelations } from './exclude-many-to-one-relations'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/validator/exclude-many-to-one-relations.test.ts

const excludeManyToOneRelationsTestCases = [
  {
    relations: [],
    expected: [],
  },
]

describe('excludeManyToOneRelations', () => {
  it.concurrent('excludeManyToOneRelations 1', () => {
    const result = excludeManyToOneRelations([
      '    User ||--|| Profile : "(id) <- (user_id)"',
      '    Team }o--|| User : "(team_id) <- (id)"',
      '    Team ||--o{ Member : "(id) <- (team_id)"',
      '    Team ||--o{ Member : "(id) <- (team_id)"',
    ])
    const expected = [
      '    User ||--|| Profile : "(id) <- (user_id)"',
      '    Team }o--|| User : "(team_id) <- (id)"',
      '    Team ||--o{ Member : "(id) <- (team_id)"',
    ]
    expect(result).toStrictEqual(expected)
  })
  it.concurrent('excludeManyToOneRelations 2', () => {
    const result = excludeManyToOneRelations([
      '    Post }o--|| User : "(authorId) <- (id)"',
      '    Post }o--|| User : "(authorId) <- (id)"',
    ])
    const expected = ['    Post }o--|| User : "(authorId) <- (id)"']
    expect(result).toStrictEqual(expected)
  })
  it.concurrent('excludeManyToOneRelations 3', () => {
    const result = excludeManyToOneRelations([])
    const expected = []
    expect(result).toStrictEqual(expected)
  })
})
