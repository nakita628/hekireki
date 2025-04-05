import { describe, expect, it } from 'vitest'
import { getPascalCaseSchemaNameHelper } from './get-pascal-case-schema-name-helper'

const getPascalCaseSchemaNameTestCases = [
  {
    schemaName: 'User',
    expected: 'UserSchema',
  },
  {
    schemaName: 'Post',
    expected: 'PostSchema',
  },
  {
    schemaName: 'Follow',
    expected: 'FollowSchema',
  },
  {
    schemaName: 'Like',
    expected: 'LikeSchema',
  },
  {
    schemaName: 'Comment',
    expected: 'CommentSchema',
  },
  {
    schemaName: 'Notification',
    expected: 'NotificationSchema',
  },
]

describe('getPascalCaseSchemaName', () => {
  it.concurrent.each(getPascalCaseSchemaNameTestCases)(
    'getPascalCaseSchemaName($schemaName) -> $expected',
    ({ schemaName, expected }) => {
      const result = getPascalCaseSchemaNameHelper(schemaName)
      expect(result).toBe(expected)
    },
  )
})
