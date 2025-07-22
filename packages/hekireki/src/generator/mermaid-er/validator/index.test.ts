import { describe, it, expect } from 'vitest'
import {
  excludeManyToOneRelations,
  isRelationship,
  parseRelation,
  removeDuplicateRelations,
} from '.'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/validator/index.test.ts

describe('validator', () => {
  // excludeManyToOneRelations
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

  // isRelationship
  describe('isRelationship', () => {
    it.concurrent(`isRelationship > should return true for input 'zero-one' `, () => {
      const result = isRelationship('zero-one')
      expect(result).toBe(true)
    })
    it.concurrent(`isRelationship > should return true for input 'one' `, () => {
      const result = isRelationship('one')
      expect(result).toBe(true)
    })
    it.concurrent(`isRelationship > should return true for input 'zero-many'`, () => {
      const result = isRelationship('zero-many')
      expect(result).toBe(true)
    })
    it.concurrent(`isRelationship > should return true for input 'many'`, () => {
      const result = isRelationship('many')
      expect(result).toBe(true)
    })
    it.concurrent(`isRelationship > should return false for input 'invalid-key'`, () => {
      const result = isRelationship('invalid-key')
      expect(result).toBe(false)
    })
  })

  // parseRelation
  describe('parseRelation', () => {
    it.concurrent('parseRelation 1', () => {
      const result = parseRelation('@relation User.id Profile.user_id one-to-one')
      const expected = {
        fromModel: 'User',
        toModel: 'Profile',
        fromField: 'id',
        toField: 'user_id',
        type: 'one-to-one',
      }
      expect(result).toStrictEqual(expected)
    })
    it.concurrent('parseRelation 2', () => {
      const result = parseRelation('@relation Team.id TeamMember.team_id one-to-many')
      const expected = {
        fromModel: 'Team',
        toModel: 'TeamMember',
        fromField: 'id',
        toField: 'team_id',
        type: 'one-to-many',
      }
      expect(result).toStrictEqual(expected)
    })
    it.concurrent('parseRelation 3', () => {
      const result = parseRelation('@relation User.id User.parent_id many-to-one')
      const expected = {
        fromModel: 'User',
        toModel: 'User',
        fromField: 'id',
        toField: 'parent_id',
        type: 'many-to-one',
      }
      expect(result).toStrictEqual(expected)
    })
    it.concurrent('parseRelation 4', () => {
      const result = parseRelation(
        '@relation ProjectTeam.project_id TeamMember.team_member_id zero-to-many',
      )
      const expected = {
        fromModel: 'ProjectTeam',
        toModel: 'TeamMember',
        fromField: 'project_id',
        toField: 'team_member_id',
        type: 'zero-to-many',
      }
      expect(result).toStrictEqual(expected)
    })
    it.concurrent('parseRelation 5', () => {
      const result = parseRelation('@relation User.id Settings.user_id one-to-one-optional')
      const expected = null
      expect(result).toStrictEqual(expected)
    })
  })

  // removeDuplicateRelations
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
})
