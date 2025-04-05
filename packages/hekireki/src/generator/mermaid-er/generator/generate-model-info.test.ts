import { describe, expect, it } from 'vitest'
import { generateModelInfo } from './generate-model-info'
import type { Model } from '../type'
import { testUserModel } from '../../../data/generate-model-fields-data'

const generateModelInfoTestCases: { model: Model; expected: string[] }[] = [
  {
    model: testUserModel,
    expected: [
      '    User {',
      '        String id "Unique identifier for the user."',
      '        String username "Username of the user."',
      '        String email "Email address of the user."',
      '        String password "Password for the user."',
      '        DateTime createdAt "Timestamp when the user was created."',
      '        DateTime updatedAt "Timestamp when the user was last updated."',
      '    }',
    ],
  },
]

describe('generateModelInfo', () => {
  it.each(generateModelInfoTestCases)(
    'generateModelInfo($model) -> $expected',
    ({ model, expected }) => {
      const result = generateModelInfo(model)
      expect(result).toEqual(expected)
    },
  )
})
