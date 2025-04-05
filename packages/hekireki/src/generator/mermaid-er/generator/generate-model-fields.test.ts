import { describe, expect, it } from 'vitest'
import { generateModelFields } from './generate-model-fields'
import type { DMMF } from '@prisma/generator-helper'
import { testUserModel } from '../../../data/generate-model-fields-data'

const generateModelFieldsTestCases: {
  model: DMMF.Model
  expected: string[]
}[] = [
  {
    model: testUserModel,
    expected: [
      '        String id "Unique identifier for the user."',
      '        String username "Username of the user."',
      '        String email "Email address of the user."',
      '        String password "Password for the user."',
      '        DateTime createdAt "Timestamp when the user was created."',
      '        DateTime updatedAt "Timestamp when the user was last updated."',
    ],
  },
]

describe('generateModelFields', () => {
  it.concurrent.each(generateModelFieldsTestCases)(
    'generateModelFields($model) -> $expected',
    async ({ model, expected }) => {
      const result = generateModelFields(model)
      expect(result).toEqual(expected)
    },
  )
})
