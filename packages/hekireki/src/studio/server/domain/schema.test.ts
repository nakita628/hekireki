import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { parseSchemaFiles } from '../services/load.js'
import {
  makeRelationName,
  detectProvider,
  findBlockLocation,
  makeImplicitManyToManyRelations,
  makeDefaultText,
  makeIndexAttribute,
  makeNativeTypeAttribute,
  makeRelationAttribute,
  makeDocumentation,
  makeSchema,
} from './schema.js'

const FIXTURE = `datasource db {
  provider = "postgresql"
}

/// Blog author
/// @p.ConfigDict(extra='forbid')
model User {
  /// Primary key
  /// @z.uuid()
  id    String @id @default(uuid())
  email String @unique @map("email_address")
  role  Role   @default(VIEWER)
  posts Post[]

  @@map("users")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String   @db.VarChar(120)
  authorId  String   @map("author_id")
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  tags      Tag[]
  createdAt DateTime @default(now())

  @@index([authorId])
  @@unique([authorId, title], map: "post_author_title")
}

model Tag {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

enum Role {
  ADMIN
  VIEWER @map("viewer")
}
`

function parse(content: string) {
  return Effect.runSync(parseSchemaFiles({ files: [{ path: 'schema.prisma', content }] }))
}

const field = (
  overrides: Partial<{
    readonly name: string
    readonly dbName: string | null
    readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
    readonly type: string
    readonly isList: boolean
    readonly isRequired: boolean
    readonly isId: boolean
    readonly isUnique: boolean
    readonly isUpdatedAt: boolean
    readonly isForeignKey: boolean
    readonly default: string | null
    readonly nativeType: string | null
    readonly documentation: string | null
    readonly annotations: readonly string[]
    readonly relation: null
    readonly attributes: readonly string[]
  }> = {},
) => ({
  name: 'f',
  dbName: null,
  kind: 'scalar' as const,
  type: 'String',
  isList: false,
  isRequired: true,
  isId: false,
  isUnique: false,
  isUpdatedAt: false,
  isForeignKey: false,
  default: null,
  nativeType: null,
  documentation: null,
  annotations: [],
  relation: null,
  attributes: [],
  ...overrides,
})

describe('makeSchema', () => {
  it('maps a Prisma datamodel to the studio contract', () => {
    const files = [{ path: 'schema.prisma', content: FIXTURE }]
    expect(makeSchema({ dmmf: parse(FIXTURE).dmmf, files })).toStrictEqual({
      files,
      provider: 'postgresql',
      models: [
        {
          name: 'User',
          dbName: 'users',
          documentation: 'Blog author',
          annotations: ["@p.ConfigDict(extra='forbid')"],
          fields: [
            field({
              name: 'id',
              isId: true,
              default: 'uuid(4)',
              documentation: 'Primary key',
              annotations: ['@z.uuid()'],
              attributes: ['@id', '@default(uuid(4))'],
            }),
            field({
              name: 'email',
              dbName: 'email_address',
              isUnique: true,
              attributes: ['@unique', '@map("email_address")'],
            }),
            field({
              name: 'role',
              kind: 'enum',
              type: 'Role',
              default: 'VIEWER',
              attributes: ['@default(VIEWER)'],
            }),
            {
              ...field({ name: 'posts', kind: 'object', type: 'Post', isList: true }),
              relation: {
                name: 'PostToUser',
                fromFields: [],
                toFields: [],
                onDelete: null,
                onUpdate: null,
              },
            },
          ],
          primaryKey: null,
          indexes: [],
          attributes: ['@@map("users")'],
          location: { file: 'schema.prisma', line: 7 },
        },
        {
          name: 'Post',
          dbName: null,
          documentation: null,
          annotations: [],
          fields: [
            field({
              name: 'id',
              type: 'Int',
              isId: true,
              default: 'autoincrement()',
              attributes: ['@id', '@default(autoincrement())'],
            }),
            field({
              name: 'title',
              nativeType: '@db.VarChar(120)',
              attributes: ['@db.VarChar(120)'],
            }),
            field({
              name: 'authorId',
              dbName: 'author_id',
              isForeignKey: true,
              attributes: ['@map("author_id")'],
            }),
            {
              ...field({
                name: 'author',
                kind: 'object',
                type: 'User',
                attributes: ['@relation(fields: [authorId], references: [id], onDelete: Cascade)'],
              }),
              relation: {
                name: 'PostToUser',
                fromFields: ['authorId'],
                toFields: ['id'],
                onDelete: 'Cascade',
                onUpdate: null,
              },
            },
            {
              ...field({ name: 'tags', kind: 'object', type: 'Tag', isList: true }),
              relation: {
                name: 'PostToTag',
                fromFields: [],
                toFields: [],
                onDelete: null,
                onUpdate: null,
              },
            },
            field({
              name: 'createdAt',
              type: 'DateTime',
              default: 'now()',
              attributes: ['@default(now())'],
            }),
          ],
          primaryKey: null,
          indexes: [
            {
              type: 'normal',
              name: null,
              dbName: null,
              fields: ['authorId'],
              attribute: '@@index([authorId])',
            },
            {
              type: 'unique',
              name: null,
              dbName: 'post_author_title',
              fields: ['authorId', 'title'],
              attribute: '@@unique([authorId, title], map: "post_author_title")',
            },
          ],
          attributes: [
            '@@index([authorId])',
            '@@unique([authorId, title], map: "post_author_title")',
          ],
          location: { file: 'schema.prisma', line: 18 },
        },
        {
          name: 'Tag',
          dbName: null,
          documentation: null,
          annotations: [],
          fields: [
            field({
              name: 'id',
              type: 'Int',
              isId: true,
              default: 'autoincrement()',
              attributes: ['@id', '@default(autoincrement())'],
            }),
            {
              ...field({ name: 'posts', kind: 'object', type: 'Post', isList: true }),
              relation: {
                name: 'PostToTag',
                fromFields: [],
                toFields: [],
                onDelete: null,
                onUpdate: null,
              },
            },
          ],
          primaryKey: null,
          indexes: [],
          attributes: [],
          location: { file: 'schema.prisma', line: 30 },
        },
      ],
      enums: [
        {
          name: 'Role',
          dbName: null,
          documentation: null,
          values: [
            { name: 'ADMIN', dbName: null },
            { name: 'VIEWER', dbName: 'viewer' },
          ],
          location: { file: 'schema.prisma', line: 35 },
        },
      ],
      relations: [
        {
          id: 'User.id->Post.authorId',
          name: 'PostToUser',
          origin: 'inferred',
          from: { model: 'User', field: 'id', cardinality: 'one' },
          to: { model: 'Post', field: 'authorId', cardinality: 'many' },
          onDelete: 'Cascade',
          onUpdate: null,
        },
        {
          id: 'Post.tags<->Tag.posts',
          name: 'PostToTag',
          origin: 'implicit-many-to-many',
          from: { model: 'Post', field: 'tags', cardinality: 'many' },
          to: { model: 'Tag', field: 'posts', cardinality: 'many' },
          onDelete: null,
          onUpdate: null,
        },
      ],
    })
  })

  it('renders composite ids, named relations, self relations and marks every column of a composite key', () => {
    const schema = makeSchema({
      dmmf: parse(`model Category {
  id       Int        @id @default(autoincrement())
  name     String
  parentId Int?       @map("parent_id")
  parent   Category?  @relation("tree", fields: [parentId], references: [id], onUpdate: NoAction)
  children Category[] @relation("tree")

  @@unique([parentId, name])
}

model Follow {
  followerId  String
  followingId String
  since       DateTime @default(now()) @updatedAt

  @@id([followerId, followingId], name: "follow_pk")
}

model Tenant {
  region String
  code   String
  users  Member[]

  @@id([region, code])
}

model Member {
  id           Int    @id
  tenantRegion String
  tenantCode   String
  tenant       Tenant @relation(fields: [tenantRegion, tenantCode], references: [region, code])
}
`).dmmf,
      files: [],
    })
    const [category, follow, , member] = schema.models
    expect(category?.fields.map((f) => f.attributes)).toStrictEqual([
      ['@id', '@default(autoincrement())'],
      [],
      ['@map("parent_id")'],
      ['@relation("tree", fields: [parentId], references: [id], onUpdate: NoAction)'],
      ['@relation("tree")'],
    ])
    expect(category?.attributes).toStrictEqual(['@@unique([parentId, name])'])
    expect(category?.location).toBeNull()
    expect(follow?.primaryKey).toStrictEqual(['followerId', 'followingId'])
    expect(follow?.attributes).toStrictEqual(['@@id([followerId, followingId], name: "follow_pk")'])
    expect(follow?.fields[2]?.attributes).toStrictEqual(['@default(now())', '@updatedAt'])
    expect(member?.fields.map((f) => [f.name, f.isForeignKey])).toStrictEqual([
      ['id', false],
      ['tenantRegion', true],
      ['tenantCode', true],
      ['tenant', false],
    ])
    expect(schema.relations[0]).toStrictEqual({
      id: 'Category.id->Category.parentId',
      name: 'tree',
      origin: 'inferred',
      from: { model: 'Category', field: 'id', cardinality: 'one' },
      to: { model: 'Category', field: 'parentId', cardinality: 'zero-many' },
      onDelete: null,
      onUpdate: 'NoAction',
    })
    expect(schema.provider).toBeNull()
  })
})

describe('makeDefaultText', () => {
  it('renders function defaults with their arguments', () => {
    expect(makeDefaultText({ kind: 'scalar', default: { name: 'now', args: [] } })).toBe('now()')
    expect(makeDefaultText({ kind: 'scalar', default: { name: 'uuid', args: [7] } })).toBe(
      'uuid(7)',
    )
    expect(
      makeDefaultText({ kind: 'scalar', default: { name: 'dbgenerated', args: ['now()'] } }),
    ).toBe('dbgenerated("now()")')
  })

  it('quotes string defaults but not enum values, and renders numbers, booleans and lists', () => {
    expect(makeDefaultText({ kind: 'scalar', default: 'anonymous' })).toBe('"anonymous"')
    expect(makeDefaultText({ kind: 'enum', default: 'VIEWER' })).toBe('VIEWER')
    expect(makeDefaultText({ kind: 'scalar', default: 0 })).toBe('0')
    expect(makeDefaultText({ kind: 'scalar', default: false })).toBe('false')
    expect(makeDefaultText({ kind: 'scalar', default: ['a', 'b'] })).toBe('["a", "b"]')
    expect(makeDefaultText({ kind: 'enum', default: ['A', 'B'] })).toBe('[A, B]')
    expect(makeDefaultText({ kind: 'scalar' })).toBeNull()
  })
})

describe('makeNativeTypeAttribute', () => {
  it('renders @db attributes with and without arguments', () => {
    expect(makeNativeTypeAttribute({ nativeType: ['Text', []] })).toBe('@db.Text')
    expect(makeNativeTypeAttribute({ nativeType: ['Decimal', ['10', '2']] })).toBe(
      '@db.Decimal(10, 2)',
    )
    expect(makeNativeTypeAttribute({ nativeType: null })).toBeNull()
    expect(makeNativeTypeAttribute({ nativeType: undefined })).toBeNull()
  })
})

describe('makeRelationName', () => {
  it('joins the model names alphabetically with To', () => {
    expect(makeRelationName({ a: 'User', b: 'Post' })).toBe('PostToUser')
    expect(makeRelationName({ a: 'Category', b: 'Category' })).toBe('CategoryToCategory')
  })
})

describe('makeRelationAttribute', () => {
  it('returns null for scalar fields and for unnamed back relations', () => {
    const { dmmf } = parse(`model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`)
    const user = dmmf.datamodel.models[0]
    const post = dmmf.datamodel.models[1]
    if (!(user && post)) throw new Error('fixture')
    expect(makeRelationAttribute({ field: user.fields[0], modelName: 'User' })).toBeNull()
    expect(makeRelationAttribute({ field: user.fields[1], modelName: 'User' })).toBeNull()
    expect(makeRelationAttribute({ field: post.fields[2], modelName: 'Post' })).toBe(
      '@relation(fields: [authorId], references: [id])',
    )
  })
})

describe('makeDocumentation', () => {
  it('separates hekireki annotations from prose', () => {
    expect(
      makeDocumentation({ documentation: 'Primary key\n@z.uuid()\n@v.pipe(v.string())' }),
    ).toStrictEqual({
      documentation: 'Primary key',
      annotations: ['@z.uuid()', '@v.pipe(v.string())'],
    })
    expect(
      makeDocumentation({ documentation: '@relation User.id Post.authorId one-to-many' }),
    ).toStrictEqual({
      documentation: null,
      annotations: ['@relation User.id Post.authorId one-to-many'],
    })
    expect(makeDocumentation({ documentation: undefined })).toStrictEqual({
      documentation: null,
      annotations: [],
    })
  })

  it('keeps prose that merely starts with an attribute name', () => {
    expect(
      makeDocumentation({
        documentation: '@@map + @map column names, FK with a referential action,\nand a join.',
      }),
    ).toStrictEqual({
      documentation: '@@map + @map column names, FK with a referential action,\nand a join.',
      annotations: [],
    })
  })
})

describe('makeIndexAttribute', () => {
  it('renders each index type with name and map', () => {
    expect(
      makeIndexAttribute({
        index: {
          model: 'A',
          type: 'id',
          isDefinedOnField: false,
          fields: [{ name: 'a' }, { name: 'b' }],
        },
      }),
    ).toBe('@@id([a, b])')
    expect(
      makeIndexAttribute({
        index: {
          model: 'A',
          type: 'unique',
          isDefinedOnField: false,
          name: 'ab',
          dbName: 'a_b',
          fields: [{ name: 'a' }, { name: 'b' }],
        },
      }),
    ).toBe('@@unique([a, b], name: "ab", map: "a_b")')
    expect(
      makeIndexAttribute({
        index: { model: 'A', type: 'normal', isDefinedOnField: false, fields: [{ name: 'a' }] },
      }),
    ).toBe('@@index([a])')
    expect(
      makeIndexAttribute({
        index: {
          model: 'A',
          type: 'fulltext',
          isDefinedOnField: false,
          fields: [{ name: 'body' }],
        },
      }),
    ).toBe('@@fulltext([body])')
  })
})

describe('findBlockLocation', () => {
  it('finds the first file and line declaring the block', () => {
    const files = [
      { path: 'a.prisma', content: 'enum Role {\n  A\n}\n' },
      { path: 'b.prisma', content: '\n\nmodel Role {\n  id Int @id\n}\n' },
    ]
    expect(findBlockLocation({ files, keyword: 'model', name: 'Role' })).toStrictEqual({
      file: 'b.prisma',
      line: 3,
    })
    expect(findBlockLocation({ files, keyword: 'enum', name: 'Role' })).toStrictEqual({
      file: 'a.prisma',
      line: 1,
    })
    expect(findBlockLocation({ files, keyword: 'model', name: 'Missing' })).toBeNull()
  })

  it('escapes regex characters and does not match a model whose name is a prefix', () => {
    expect(
      findBlockLocation({
        files: [{ path: 'a.prisma', content: 'model A {\n}\n' }],
        keyword: 'model',
        name: 'A+',
      }),
    ).toBeNull()
    expect(
      findBlockLocation({
        files: [{ path: 'a.prisma', content: 'model A+ {\n}\n' }],
        keyword: 'model',
        name: 'A+',
      }),
    ).toStrictEqual({ file: 'a.prisma', line: 1 })
    const files = [{ path: 'a.prisma', content: 'model UserProfile {\n}\nmodel User {\n}\n' }]
    expect(findBlockLocation({ files, keyword: 'model', name: 'User' })).toStrictEqual({
      file: 'a.prisma',
      line: 3,
    })
  })
})

describe('detectProvider', () => {
  it('reads the provider from the datasource block and ignores generator providers', () => {
    expect(
      detectProvider({
        files: [{ path: 'a.prisma', content: 'datasource db {\n  provider = "mysql"\n}\n' }],
      }),
    ).toBe('mysql')
    expect(
      detectProvider({
        files: [
          { path: 'a.prisma', content: 'generator client {\n  provider = "prisma-client"\n}\n' },
        ],
      }),
    ).toBeNull()
  })
})

describe('makeImplicitManyToManyRelations', () => {
  it('emits one relation per implicit join table, ordered by the lower key', () => {
    const { dmmf } = parse(`model Actor {
  id    Int    @id
  films Film[] @relation("cast")
}

model Film {
  id     Int     @id
  actors Actor[] @relation("cast")
}
`)
    expect(makeImplicitManyToManyRelations({ models: dmmf.datamodel.models })).toStrictEqual([
      {
        id: 'Actor.films<->Film.actors',
        name: 'cast',
        origin: 'implicit-many-to-many',
        from: { model: 'Actor', field: 'films', cardinality: 'many' },
        to: { model: 'Film', field: 'actors', cardinality: 'many' },
        onDelete: null,
        onUpdate: null,
      },
    ])
  })

  it('handles a self many-to-many', () => {
    const { dmmf } = parse(`model User {
  id        Int    @id
  followers User[] @relation("follows")
  following User[] @relation("follows")
}
`)
    expect(makeImplicitManyToManyRelations({ models: dmmf.datamodel.models })).toStrictEqual([
      {
        id: 'User.followers<->User.following',
        name: 'follows',
        origin: 'implicit-many-to-many',
        from: { model: 'User', field: 'followers', cardinality: 'many' },
        to: { model: 'User', field: 'following', cardinality: 'many' },
        onDelete: null,
        onUpdate: null,
      },
    ])
  })
})
