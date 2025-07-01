import { describe, expect, it } from 'vitest'
import { parseRelation } from './parse-relation'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/validator/parse-relation.test.ts

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
