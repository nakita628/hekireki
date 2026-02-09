import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import {
  erContent,
  extractRelations,
  extractRelationsFromDmmf,
  modelFields,
  modelInfo,
} from '../../helper/mermaid-er.js'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/mermaid-er.test.ts

const userModel: DMMF.Model = {
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
      default: { name: 'uuid', args: [4] },
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
}

const postModel: DMMF.Model = {
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
      default: { name: 'uuid', args: [4] },
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
}

describe('modelFields', () => {
  it.concurrent('generates model fields', () => {
    const result = modelFields(userModel)
    expect(result).toStrictEqual([
      '        string id PK "Primary key"',
      '        string name "Display name"',
    ])
  })
})

describe('modelInfo', () => {
  it.concurrent('generates model info', () => {
    const result = modelInfo(userModel)
    expect(result).toStrictEqual([
      '    User {',
      '        string id PK "Primary key"',
      '        string name "Display name"',
      '    }',
    ])
  })
})

describe('extractRelationsFromDmmf', () => {
  it.concurrent('extracts relations from DMMF models', () => {
    const result = extractRelationsFromDmmf([userModel, postModel])
    expect(result).toStrictEqual([
      '    User ||--}| Post : "(id) - (userId)"',
    ])
  })
})

describe('extractRelations', () => {
  it.concurrent('extracts relations from model documentation', () => {
    const result = extractRelations({
      ...postModel,
      documentation: '@relation User.id Post.userId one-to-many',
    })
    expect(result).toStrictEqual(['    User ||--}| Post : "(id) - (userId)"'])
  })
})

describe('erContent', () => {
  it.concurrent('generates complete ER content', () => {
    const result = erContent([userModel, postModel])
    expect(result).toStrictEqual([
      '```mermaid',
      'erDiagram',
      '    User ||--}| Post : "(id) - (userId)"',
      '    User {',
      '        string id PK "Primary key"',
      '        string name "Display name"',
      '    }',
      '    Post {',
      '        string id PK "Primary key"',
      '        string title "Article title"',
      '        string content "Body content (no length limit)"',
      '        string userId FK "Foreign key referencing User.id"',
      '    }',
      '```',
    ])
  })
})
