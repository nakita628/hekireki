import { describe, expect, it } from 'vitest'
import { extractRelations } from './extract-relations'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/validator/extract-relations.test.ts

describe('extractRelations', () => {
  it.concurrent('extractRelations Test', () => {
    const result = extractRelations({
      name: 'Post',
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
          name: 'title',
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
            'Article title\n@z.string().min(1).max(100)\n@v.pipe(v.string(), v.minLength(1), v.maxLength(100))',
        },
        {
          name: 'content',
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
          documentation: 'Body content (no length limit)\n@z.string()\n@v.string()',
        },
        {
          name: 'userId',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: true,
          hasDefaultValue: false,
          type: 'String',
          nativeType: null,
          isGenerated: false,
          isUpdatedAt: false,
          documentation:
            'Foreign key referencing User.id\n@z.uuid()\n@v.pipe(v.string(), v.uuid())',
        },
        {
          name: 'user',
          kind: 'object',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'User',
          nativeType: null,
          relationName: 'PostToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          isGenerated: false,
          isUpdatedAt: false,
          documentation: 'Prisma relation definition',
        },
      ],
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      isGenerated: false,
      documentation: '@relation User.id Post.userId one-to-many',
    })

    const expected = ['    User ||--}| Post : "(id) - (userId)"']
    expect(result).toStrictEqual(expected)
  })
})
