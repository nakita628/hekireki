import { describe, expect, it } from 'vitest'
import { removeDuplicateRelations } from '.'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/validator/remove-duplicate

describe('removeDuplicateRelations', () => {
  it.concurrent('removeDuplicateRelations 1', () => {
    const result = removeDuplicateRelations([
      '    Post }o--|| User : "PK(authorId) <- FK(id)"',
      '    Post }o--|| User : "PK(authorId) <- FK(id)"',
    ])
    const expected = ['    Post }o--|| User : "PK(authorId) <- FK(id)"']
    expect(result).toStrictEqual(expected)
  })
  it.concurrent('removeDuplicateRelations 2', () => {
    const result = removeDuplicateRelations([
      '    User ||--o{ Post : "(id) - (userId)"',
      '    User ||--o{ Comment : "(id) - (userId)"',
      '    User ||--o{ Notification : "(id) - (userId)"',
      '    User ||--o{ Follow : "(id) - (followerId)"',
      '    User ||--o{ Follow : "(id) - (followingId)"',
      '    User ||--o{ Like : "(id) - (userId)"',
    ])
    const expected = [
      '    User ||--o{ Post : "(id) - (userId)"',
      '    User ||--o{ Comment : "(id) - (userId)"',
      '    User ||--o{ Notification : "(id) - (userId)"',
      '    User ||--o{ Follow : "(id) - (followerId)"',
      '    User ||--o{ Follow : "(id) - (followingId)"',
      '    User ||--o{ Like : "(id) - (userId)"',
    ]
    expect(result).toStrictEqual(expected)
  })

  it.concurrent('removeDuplicateRelations 3', () => {
    const result = removeDuplicateRelations([])
    const expected = []
    expect(result).toStrictEqual(expected)
  })
})
