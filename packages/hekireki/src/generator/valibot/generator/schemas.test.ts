import { describe, expect, it } from 'vitest'
import { generateValibotSchemas } from './generate-valibot-schemas'
import type { Config } from '..'

const generateValibotSchemasTestCases: {
  modelFields: {
    modelName: string
    fieldName: string
    validation: string | null
    documentation: string
    comment: string[]
  }[]
  config: Config
  expected: string
}[] = [
  {
    modelFields: [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        comment: ['Unique identifier for the user.', '@z.string().uuid()'],
        validation: 'pipe(v.string(), v.uuid())',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'username',
        comment: ['Username of the user.', '@z.string().min(3)'],
        validation: 'pipe(v.string(), v.minLength(3))',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'email',
        comment: ['Email address of the user.', '@z.string().email()'],
        validation: 'pipe(v.string(), v.email())',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'password',
        comment: ['Password for the user.', '@z.string().min(8).max(100)'],
        validation: 'pipe(v.string(), v.minLength(8), v.maxLength(100))',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'createdAt',
        comment: ['Timestamp when the user was created.', '@z.date()'],
        validation: 'date()',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'updatedAt',
        comment: ['Timestamp when the user was last updated.', '@z.date()'],
        validation: 'date()',
      },
    ],
    config: {
      schemaName: 'PascalCase',
      typeName: 'PascalCase',
      comment: true,
    },
    expected: `export const UserSchema = v.object({
  /**
   * Unique identifier for the user.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Username of the user.
   */
  username: v.pipe(v.string(), v.minLength(3)),
  /**
   * Email address of the user.
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Password for the user.
   */
  password: v.pipe(v.string(), v.minLength(8), v.maxLength(100)),
  /**
   * Timestamp when the user was created.
   */
  createdAt: v.date(),
  /**
   * Timestamp when the user was last updated.
   */
  updatedAt: v.date()
})`,
  },
]

describe('generateValibotSchemas', () => {
  it.each(generateValibotSchemasTestCases)(
    'generateValibotSchemas($modelFields, $config) -> $expected',
    ({ modelFields, config, expected }) => {
      const result = generateValibotSchemas(modelFields, config)
      expect(result).toBe(expected)
    },
  )
})
