import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { dbmlContent, generateEnums, generateRelations, generateTables } from './dbml-content.js'

describe('generateTables', () => {
  it('strips Zod annotations (@z.*) from field documentation', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation: 'Unique user ID\n@z.cuid()',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual(["Table User {\n  id String [pk, note: 'Unique user ID']\n}"])
  })

  it('strips Valibot annotations (@v.*) from field documentation', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'email',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: true,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation: 'Email address\n@v.pipe(v.string(), v.email())',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      "Table User {\n  email String [unique, not null, note: 'Email address']\n}",
    ])
  })

  it('strips ArkType annotations (@a.*) from field documentation', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
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
            documentation: 'Display name\n@a."1 <= string <= 50"',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      "Table User {\n  name String [not null, note: 'Display name']\n}",
    ])
  })

  it('strips Effect annotations (@e.*) from field documentation', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation: 'Primary key\n@e.Schema.UUID',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual(["Table User {\n  id String [pk, note: 'Primary key']\n}"])
  })

  it('strips @relation annotations from model documentation', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
        documentation: '@relation User.id Post.userId one-to-many',
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual(['Table User {\n  id String [pk]\n}'])
  })

  it('strips multiple annotations and keeps only description', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'email',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: true,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation:
              'Email address\n@z.email()\n@v.pipe(v.string(), v.email())\n@a."string.email"\n@e.Schema.String',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      "Table User {\n  email String [unique, not null, note: 'Email address']\n}",
    ])
  })

  it('handles documentation with only annotations (no description)', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation: '@z.cuid()\n@v.pipe(v.string(), v.cuid())',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual(['Table User {\n  id String [pk]\n}'])
  })

  it('handles undefined documentation', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual(['Table User {\n  id String [pk]\n}'])
  })

  it('handles empty string documentation', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation: '',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual(['Table User {\n  id String [pk]\n}'])
  })

  it('preserves description with special characters after stripping annotations', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'bio',
            kind: 'scalar',
            isList: false,
            isRequired: false,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation: "User's bio with 'quotes'\n@z.string().max(500)",
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      "Table User {\n  bio String [note: 'User\\'s bio with \\'quotes\\'']\n}",
    ])
  })

  it('generates basic table definition', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
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
            type: 'Int',
            default: { name: 'autoincrement', args: [] },
            isGenerated: false,
            isUpdatedAt: false,
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
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      'Table User {\n  id Int [pk, increment]\n  name String [not null]\n}',
    ])
  })

  it('includes field documentation as notes', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'email',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: true,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            documentation: "User's email address",
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      "Table User {\n  email String [unique, not null, note: 'User\\'s email address']\n}",
    ])
  })

  it('generates table with model documentation (Note block)', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
        documentation: 'User table stores user information',
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      "Table User {\n  id String [pk]\n\n  Note: 'User table stores user information'\n}",
    ])
  })

  it('generates table with composite unique index', () => {
    const models: DMMF.Model[] = [
      {
        name: 'Account',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'provider',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'providerAccountId',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [['provider', 'providerAccountId']],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateTables(models)

    expect(result).toStrictEqual([
      'Table Account {\n  id String [pk]\n  provider String [not null]\n  providerAccountId String [not null]\n\n  indexes {\n    (provider, providerAccountId) [unique]\n  }\n}',
    ])
  })
})

describe('generateEnums', () => {
  it('generates enum definition', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [
          { name: 'USER', dbName: null },
          { name: 'ADMIN', dbName: null },
        ],
        dbName: null,
      },
    ]

    const result = generateEnums(enums)

    expect(result).toStrictEqual(['Enum Role {\n  USER\n  ADMIN\n}'])
  })

  it('generates multiple enums', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [{ name: 'USER', dbName: null }],
        dbName: null,
      },
      {
        name: 'Status',
        values: [
          { name: 'ACTIVE', dbName: null },
          { name: 'INACTIVE', dbName: null },
        ],
        dbName: null,
      },
    ]

    const result = generateEnums(enums)

    expect(result).toStrictEqual(['Enum Role {\n  USER\n}', 'Enum Status {\n  ACTIVE\n  INACTIVE\n}'])
  })

  it('returns empty array for empty enums', () => {
    const enums: DMMF.DatamodelEnum[] = []

    const result = generateEnums(enums)

    expect(result).toStrictEqual([])
  })
})

describe('generateRelations', () => {
  it('generates foreign key reference', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
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
            type: 'Int',
            default: { name: 'autoincrement', args: [] },
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'posts',
            kind: 'object',
            isList: true,
            isRequired: false,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'Post',
            relationName: 'PostToUser',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
      {
        name: 'Post',
        dbName: null,
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
            type: 'Int',
            default: { name: 'autoincrement', args: [] },
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'userId',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'Int',
            isGenerated: false,
            isUpdatedAt: false,
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
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateRelations(models)

    expect(result).toStrictEqual(['Ref Post_userId_fk: Post.userId > User.id'])
  })

  it('generates one-to-one relation with unique FK', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'profile',
            kind: 'object',
            isList: false,
            isRequired: false,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'Profile',
            relationName: 'ProfileToUser',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
      {
        name: 'Profile',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'userId',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: true,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
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
            relationName: 'ProfileToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateRelations(models)

    expect(result).toStrictEqual(['Ref Profile_userId_fk: Profile.userId - User.id'])
  })

  it('generates relation with onDelete cascade', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'posts',
            kind: 'object',
            isList: true,
            isRequired: false,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'Post',
            relationName: 'PostToUser',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
      {
        name: 'Post',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'userId',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
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
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
            relationOnDelete: 'Cascade',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateRelations(models)

    expect(result).toStrictEqual(['Ref Post_userId_fk: Post.userId > User.id [delete: Cascade]'])
  })

  it('returns empty array when no relations exist', () => {
    const models: DMMF.Model[] = [
      {
        name: 'User',
        dbName: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: true,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'String',
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      },
    ]

    const result = generateRelations(models)

    expect(result).toStrictEqual([])
  })
})

describe('dbmlContent', () => {
  it('generates complete DBML without header', () => {
    const datamodel: DMMF.Datamodel = {
      models: [
        {
          name: 'User',
          dbName: null,
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
              type: 'Int',
              default: { name: 'autoincrement', args: [] },
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ],
      enums: [],
      types: [],
    }

    const result = dbmlContent(datamodel)

    expect(result).toBe('Table User {\n  id Int [pk, increment]\n}')
  })

  it('generates DBML with enum and table', () => {
    const datamodel: DMMF.Datamodel = {
      models: [
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'id',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'role',
              kind: 'enum',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: true,
              type: 'Role',
              default: 'USER',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ],
      enums: [
        {
          name: 'Role',
          values: [
            { name: 'USER', dbName: null },
            { name: 'ADMIN', dbName: null },
          ],
          dbName: null,
        },
      ],
      types: [],
    }

    const result = dbmlContent(datamodel)

    expect(result).toBe(
      "Enum Role {\n  USER\n  ADMIN\n}\n\nTable User {\n  id String [pk]\n  role Role [default: 'USER', not null]\n}",
    )
  })

  it('generates DBML with relations', () => {
    const datamodel: DMMF.Datamodel = {
      models: [
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'id',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'posts',
              kind: 'object',
              isList: true,
              isRequired: false,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'Post',
              relationName: 'PostToUser',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
        {
          name: 'Post',
          dbName: null,
          fields: [
            {
              name: 'id',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'userId',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
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
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ],
      enums: [],
      types: [],
    }

    const result = dbmlContent(datamodel)

    // Note: Relation fields with isList=true (posts) don't have constraints
    // Single required relation fields (user) get 'not null' based on isRequired
    expect(result).toBe(
      'Table User {\n  id String [pk]\n  posts Post\n}\n\nTable Post {\n  id String [pk]\n  userId String [not null]\n  user User [not null]\n}\n\nRef Post_userId_fk: Post.userId > User.id',
    )
  })

  it('returns empty string for empty datamodel', () => {
    const datamodel: DMMF.Datamodel = {
      models: [],
      enums: [],
      types: [],
    }

    const result = dbmlContent(datamodel)

    expect(result).toBe('')
  })
})
