import { describe, expect, it } from 'vitest'
import { generateZodInfer } from './generate-zod-infer'
import type { Config } from '..'

const generateZodInferTestCases: {
  modelName: string
  config: Config
  expected: string
}[] = [
  {
    modelName: 'User',
    config: {
      schemaName: 'PascalCase',
      typeName: 'PascalCase',
      comment: true,
    },
    expected: 'export type User = z.infer<typeof UserSchema>',
  },
  {
    modelName: 'Profile',
    config: {
      schemaName: 'PascalCase',
      typeName: 'camelCase',
      comment: true,
    },
    expected: 'export type profile = z.infer<typeof ProfileSchema>',
  },
  {
    modelName: 'Post',
    config: {
      schemaName: 'PascalCase',
      typeName: 'camelCase',
      comment: false,
    },
    expected: 'export type post = z.infer<typeof PostSchema>',
  },
]

describe('generateZodInfer', () => {
  it.each(generateZodInferTestCases)(
    'generateZodInfer($modelName) -> $expected',
    ({ modelName, config, expected }) => {
      const result = generateZodInfer(modelName, config)
      expect(result).toBe(expected)
    },
  )
})
