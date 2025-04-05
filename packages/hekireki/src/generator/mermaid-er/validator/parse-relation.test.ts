import { describe, expect, it } from 'vitest'
import { parseRelation } from './parse-relation'

const parseRelationTestCases = [
  {
    value: '@relation User.id Profile.user_id one-to-one',
    expected: {
      fromModel: 'User',
      toModel: 'Profile',
      fromField: 'id',
      toField: 'user_id',
      type: 'one-to-one',
    },
  },
  {
    value: '@relation Team.id TeamMember.team_id one-to-many',
    expected: {
      fromModel: 'Team',
      toModel: 'TeamMember',
      fromField: 'id',
      toField: 'team_id',
      type: 'one-to-many',
    },
  },

  {
    value: '@relation User.id User.parent_id many-to-one',
    expected: {
      fromModel: 'User',
      toModel: 'User',
      fromField: 'id',
      toField: 'parent_id',
      type: 'many-to-one',
    },
  },

  {
    value: '@relation ProjectTeam.project_id TeamMember.team_member_id zero-to-many',
    expected: {
      fromModel: 'ProjectTeam',
      toModel: 'TeamMember',
      fromField: 'project_id',
      toField: 'team_member_id',
      type: 'zero-to-many',
    },
  },

  {
    value: '@relation User.id Settings.user_id one-to-one-optional',
    expected: null,
  },
]

describe('parseRelation', () => {
  it.each(parseRelationTestCases)('ParseRelation($value) -> $expected', ({ value, expected }) => {
    const result = parseRelation(value)
    expect(result).toEqual(expected)
  })
})
