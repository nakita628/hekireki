import { describe, expect, it } from 'vitest'
import { getCamelCaseSchemaNameHelper } from './get-camel-case-schema-name-helper'

const getCamelCaseSchemaNameTestCases = [
  {
    schemaName: 'User',
    expected: 'userSchema',
  },
  {
    schemaName: 'Post',
    expected: 'postSchema',
  },
  {
    schemaName: 'Customer',
    expected: 'customerSchema',
  },
  {
    schemaName: 'Follow',
    expected: 'followSchema',
  },
  {
    schemaName: 'Like',
    expected: 'likeSchema',
  },
  {
    schemaName: 'Comment',
    expected: 'commentSchema',
  },
  {
    schemaName: 'Notification',
    expected: 'notificationSchema',
  },
]

describe('getCamelCaseSchemaName', () => {
  it.concurrent.each(getCamelCaseSchemaNameTestCases)(
    'getCamelCaseSchemaName($schemaName) -> $expected',
    ({ schemaName, expected }) => {
      const result = getCamelCaseSchemaNameHelper(schemaName)
      expect(result).toBe(expected)
    },
  )
})
