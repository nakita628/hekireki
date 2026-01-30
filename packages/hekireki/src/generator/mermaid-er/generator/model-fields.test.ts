import { describe, expect, it } from 'vitest'
import { modelFields } from '.'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/generator/model-fields.test

describe('modelFields', () => {
  it.concurrent('modelFields Test', () => {
    const result = modelFields({
      name: 'User',
      dbName: null,
      schema: null,
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          hasDefaultValue: true,
          type: 'String',
          nativeType: null,
          default: {
            name: 'uuid',
            args: [4],
          },
          isGenerated: false,
          isUpdatedAt: false,
          documentation: 'Primary key\n@z.uuid()\n@v.pipe(v.string(), v.uuid())',
        },
        {
          name: 'name',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'String',
          nativeType: null,
          isGenerated: false,
          isUpdatedAt: false,
          documentation:
            'Display name\n@z.string().min(1).max(50)\n@v.pipe(v.string(), v.minLength(1), v.maxLength(50))',
        },
        {
          name: 'posts',
          kind: 'object',
          isList: true,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'Post',
          nativeType: null,
          relationName: 'PostToUser',
          relationFromFields: [],
          relationToFields: [],
          isGenerated: false,
          isUpdatedAt: false,
          documentation: 'One-to-many relation to Post',
        },
      ],
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      isGenerated: false,
    })

    const expected = ['        string id PK "Primary key"', '        string name "Display name"']
    expect(result).toStrictEqual(expected)
  })
})
