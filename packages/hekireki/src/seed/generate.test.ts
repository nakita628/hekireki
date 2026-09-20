import { Faker, allLocales } from '@faker-js/faker'
import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import type { SeedConfig } from './config.js'
import { generateSeedRows } from './generate/index.js'
import { resolveSeedConfig } from './options.js'
import { makeSeedPlan } from './plan.js'
import type { SeedTableRows } from './plan.js'

const SCHEMA = `
datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  EDITOR
  VIEWER
}

model User {
  id        String    @id @default(uuid(7))
  email     String    @unique
  name      String
  role      Role      @default(VIEWER)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  profile   Profile?
  posts     Post[]
  comments  Comment[]
  followers Follow[]  @relation("following")
  following Follow[]  @relation("follower")
}

model Profile {
  id     Int    @id @default(autoincrement())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id])
  bio    String?
}

model Post {
  id       Int       @id @default(autoincrement())
  title    String
  authorId String
  author   User      @relation(fields: [authorId], references: [id])
  tags     Tag[]
  comments Comment[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  label String @unique
  posts Post[]
}

model Comment {
  id       Int     @id @default(autoincrement())
  body     String
  postId   Int
  post     Post    @relation(fields: [postId], references: [id])
  authorId String?
  author   User?   @relation(fields: [authorId], references: [id])
}

model Follow {
  followerId  String
  followingId String
  follower    User   @relation("follower", fields: [followerId], references: [id])
  following   User   @relation("following", fields: [followingId], references: [id])

  @@id([followerId, followingId])
}

model Category {
  id       Int        @id @default(autoincrement())
  name     String
  parentId Int?
  parent   Category?  @relation("tree", fields: [parentId], references: [id])
  children Category[] @relation("tree")

  @@unique([parentId, name])
}

model Warehouse {
  country String
  code    String
  stocks  Stock[]

  @@id([country, code])
}

model Stock {
  id        Int       @id @default(autoincrement())
  country   String
  code      String
  warehouse Warehouse @relation(fields: [country, code], references: [country, code])
}
`

function tables() {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
  if ('type' in result) throw new Error(result.error.message)
  return Effect.runSync(makeSeedPlan(result.datamodel))
}

const TABLES = tables()

function generate(config: SeedConfig = {}, seed = 42) {
  const faker = new Faker({ locale: [allLocales.en, allLocales.base] })
  faker.seed(seed)
  return Effect.runSync(
    generateSeedRows({ tables: TABLES, config: resolveSeedConfig(config), faker }),
  )
}

/** The message the generation fails with. */
function failure(config: SeedConfig, seed = 42) {
  const faker = new Faker({ locale: [allLocales.en, allLocales.base] })
  faker.seed(seed)
  return Effect.runSync(
    Effect.flip(generateSeedRows({ tables: TABLES, config: resolveSeedConfig(config), faker })),
  ).message
}

function rowsOf(entries: readonly SeedTableRows[], name: string) {
  const entry = entries.find((e) => e.table.name === name)
  if (entry === undefined) throw new Error(`no table ${name}`)
  return entry.rows
}

describe('generateSeedRows', () => {
  it('gives every table the default count, one-to-one children at most one per parent, join rows per pair', () => {
    const result = generate({ count: 6 })
    expect(result.map((entry) => [entry.table.name, entry.rows.length])).toStrictEqual([
      ['User', 6],
      ['Profile', 6],
      ['Post', 6],
      ['Tag', 6],
      ['Comment', 6],
      ['Follow', 6],
      ['Category', 6],
      ['Warehouse', 6],
      ['Stock', 6],
      ['_PostToTag', rowsOf(result, '_PostToTag').length],
    ])
    expect(rowsOf(result, '_PostToTag').length).toBeLessThanOrEqual(18)
  })

  it('is the same for the same seed and different for another', () => {
    const dates = { from: '2025-01-01', to: '2025-12-31' }
    const first = generate({ count: 5, dates }, 7)
    const again = generate({ count: 5, dates }, 7)
    const other = generate({ count: 5, dates }, 8)
    expect(first).toStrictEqual(again)
    expect(first).not.toStrictEqual(other)
  })

  it('points every foreign key at a row that exists, composite keys included', () => {
    const result = generate({ count: 8 })
    const userIds = new Set(rowsOf(result, 'User').map((row) => row.id))
    const postIds = new Set(rowsOf(result, 'Post').map((row) => row.id))
    const tagIds = new Set(rowsOf(result, 'Tag').map((row) => row.id))
    for (const post of rowsOf(result, 'Post')) expect(userIds.has(post.authorId)).toBe(true)
    for (const comment of rowsOf(result, 'Comment')) {
      expect(postIds.has(comment.postId)).toBe(true)
      expect(comment.authorId === null || userIds.has(comment.authorId)).toBe(true)
    }
    for (const follow of rowsOf(result, 'Follow')) {
      expect(userIds.has(follow.followerId) && userIds.has(follow.followingId)).toBe(true)
    }
    for (const pair of rowsOf(result, '_PostToTag')) {
      expect(postIds.has(pair.A) && tagIds.has(pair.B)).toBe(true)
    }
    const warehouses = new Set(
      rowsOf(result, 'Warehouse').map((row) => JSON.stringify([row.country, row.code])),
    )
    for (const stock of rowsOf(result, 'Stock')) {
      expect(warehouses.has(JSON.stringify([stock.country, stock.code]))).toBe(true)
    }
  })

  it('uses each parent once for a one-to-one relation and caps the default count to the parents', () => {
    const result = generate({ count: 5, models: { User: { count: 3 } } })
    const profiles = rowsOf(result, 'Profile')
    expect(profiles.length).toBe(3)
    expect(new Set(profiles.map((row) => row.userId)).size).toBe(3)
  })

  it('refuses an explicit one-to-one count above the parents', () => {
    expect(failure({ models: { User: { count: 2 }, Profile: { count: 3 } } })).toBe(
      'Profile.user is a one-to-one relation to User, so at most 2 Profile rows can be seeded (User has 2).',
    )
  })

  it('honours @unique, @@id and @@unique for every row', () => {
    const result = generate({ count: 40, models: { User: { count: 10 }, Category: { count: 40 } } })
    const emails = rowsOf(result, 'User').map((row) => row.email)
    expect(new Set(emails).size).toBe(emails.length)
    const follows = rowsOf(result, 'Follow').map((row) =>
      JSON.stringify([row.followerId, row.followingId]),
    )
    expect(new Set(follows).size).toBe(follows.length)
    const categories = rowsOf(result, 'Category').map((row) =>
      JSON.stringify([row.parentId, row.name]),
    )
    expect(new Set(categories).size).toBe(categories.length)
  })

  it('reports a unique constraint it cannot satisfy', () => {
    expect(failure({ models: { User: { count: 2 }, Follow: { count: 5 } } })).toBe(
      "Follow: cannot satisfy the unique constraint on followerId, followingId for 5 or more rows.\n   Lower models.Follow.count or widen the field's range.",
    )
  })

  it('links a self relation to an earlier row or leaves it null, never to a later one', () => {
    const result = generate({ count: 12, nullRate: 0 })
    const categories = rowsOf(result, 'Category')
    expect(categories[0]?.parentId).toBeNull()
    for (const [index, category] of categories.entries()) {
      const parent = category.parentId
      expect(parent === null || categories.slice(0, index).some((row) => row.id === parent)).toBe(
        true,
      )
    }
  })

  it('updates a row at or after it was created', () => {
    const result = generate({ count: 20 })
    for (const user of rowsOf(result, 'User')) {
      const created = user.createdAt
      const updated = user.updatedAt
      expect(created instanceof Date && updated instanceof Date && updated >= created).toBe(true)
    }
  })

  it('leaves optional foreign keys null at the null rate', () => {
    const none = generate({ count: 30, nullRate: 0 })
    const all = generate({ count: 30, nullRate: 1 })
    expect(rowsOf(none, 'Comment').every((row) => row.authorId !== null)).toBe(true)
    expect(rowsOf(all, 'Comment').every((row) => row.authorId === null)).toBe(true)
  })

  it('applies field rules and relation rules', () => {
    const result = generate({
      count: 4,
      models: {
        User: {
          count: 10,
          fields: {
            role: { values: ['ADMIN'] },
            name: (faker, context) => `user-${context.index}-${faker.string.alpha(2)}`,
          },
        },
        Post: { count: 3, relations: { tags: { min: 2, max: 2 } } },
      },
    })
    expect(rowsOf(result, 'User').every((row) => row.role === 'ADMIN')).toBe(true)
    expect(
      rowsOf(result, 'User').map((row) =>
        typeof row.name === 'string' ? row.name.slice(0, 7) : '',
      ),
    ).toStrictEqual([
      'user-0-',
      'user-1-',
      'user-2-',
      'user-3-',
      'user-4-',
      'user-5-',
      'user-6-',
      'user-7-',
      'user-8-',
      'user-9-',
    ])
    expect(rowsOf(result, '_PostToTag').length).toBe(6)
    const fromTags = generate({
      count: 4,
      models: { Tag: { count: 5, relations: { posts: { min: 1, max: 1 } } } },
    })
    expect(rowsOf(fromTags, '_PostToTag').length).toBe(5)
    expect(rowsOf(fromTags, '_PostToTag').every((pair) => 'A' in pair && 'B' in pair)).toBe(true)
  })

  it('rejects rules for models and fields the schema does not have', () => {
    expect(
      failure({
        models: {
          Ghost: { count: 1 },
          User: { fields: { nope: { min: 1 } }, relations: { email: { max: 1 } }, count: -1 },
        },
      }),
    ).toBe(
      [
        'models.Ghost: no model named Ghost in the schema.',
        'models.User.fields.nope: User has no scalar field named nope.',
        'models.User.relations.email: User has no relation field named email that a rule can bound (a list, or the other side of a key).',
        'models.User.count: expected a non-negative integer, got -1.',
      ].join('\n   '),
    )
  })

  it('reports a required parent that has no rows', () => {
    expect(failure({ count: 3, models: { User: { count: 0 } } })).toBe(
      'Post.author requires a User row, but User has none. Give User a count.',
    )
  })

  it('seeds only the models the config names, unless a count is set for all of them', () => {
    const named = generate({ models: { User: { count: 2 }, Tag: { count: 1 } } })
    expect(named.map((entry) => [entry.table.name, entry.rows.length])).toStrictEqual([
      ['User', 2],
      ['Profile', 0],
      ['Post', 0],
      ['Tag', 1],
      ['Comment', 0],
      ['Follow', 0],
      ['Category', 0],
      ['Warehouse', 0],
      ['Stock', 0],
      ['_PostToTag', 0],
    ])
    const all = generate({ count: 2 })
    expect(
      all.filter((entry) => entry.table.kind === 'model').every((entry) => entry.rows.length === 2),
    ).toBe(true)
  })

  it('draws fresh rows without a seed, and dates from the year before the run without a window', () => {
    const faker = new Faker({ locale: [allLocales.en, allLocales.base] })
    const rows = Effect.runSync(
      generateSeedRows({
        tables: TABLES,
        config: resolveSeedConfig({ models: { User: { count: 5 } } }),
        faker,
      }),
    )
    const yearAgo = Date.now() - 366 * 24 * 60 * 60 * 1000
    for (const user of rowsOf(rows, 'User')) {
      const created = user.createdAt
      expect(
        created instanceof Date &&
          created.getTime() >= yearAgo &&
          created.getTime() <= Date.now() + 1000,
      ).toBe(true)
    }
  })

  it('inserts real rows as written and fills what they leave out from the defaults', () => {
    const result = generate({
      count: 2,
      models: {
        User: {
          data: [
            {
              id: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a01',
              email: 'ann@example.com',
              name: 'Ann',
              role: 'ADMIN',
            },
            { id: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a02', email: 'bob@example.com', name: 'Bob' },
          ],
        },
        Post: {
          data: [
            { id: 7, title: 'Hello', authorId: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a02' },
            { title: 'Second', authorId: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a01' },
          ],
        },
      },
    })
    const users = rowsOf(result, 'User')
    expect(users.length).toBe(2)
    expect(users[0]).toMatchObject({
      id: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a01',
      email: 'ann@example.com',
      name: 'Ann',
      role: 'ADMIN',
    })
    expect(users[1]).toMatchObject({ email: 'bob@example.com', name: 'Bob', role: 'VIEWER' })
    expect(users[1]?.createdAt).toBeInstanceOf(Date)
    expect(users[1]?.updatedAt).toBeInstanceOf(Date)
    const posts = rowsOf(result, 'Post')
    expect(posts[0]).toStrictEqual({
      id: 7,
      title: 'Hello',
      authorId: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a02',
    })
    expect(posts[1]).toStrictEqual({
      id: 2,
      title: 'Second',
      authorId: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a01',
    })
  })

  it('refuses real rows next to count or fields for the same model', () => {
    expect(
      failure({ models: { User: { data: [{ email: 'a@example.com', name: 'A' }], count: 4 } } }),
    ).toBe(
      'models.User: `data` and `count` / `fields` are exclusive. Give the real rows in `data`, or let faker make them with `count` and `fields`, not both.',
    )
  })

  it('refuses a real row that leaves out a required field without a default', () => {
    expect(failure({ models: { User: { data: [{ email: 'a@example.com' }] } } })).toBe(
      'User data[0].name: the field is required and has no default, so the row must give it.',
    )
    // A required key left out is not an error: the row is linked to a parent that exists.
    const linked = generate({ models: { User: { count: 1 }, Post: { data: [{ title: 'x' }] } } })
    expect(rowsOf(linked, 'Post')[0]?.authorId).toBe(rowsOf(linked, 'User')[0]?.id)
    expect(failure({ models: { Post: { data: [{ title: 'x' }] } } })).toBe(
      'Post.author requires a User row, but User has none. Give User a count.',
    )
  })

  it('reads real values as their columns store them: dates from strings, bigints from numbers', () => {
    const result = generate({
      count: 1,
      models: {
        User: {
          data: [{ email: 'a@example.com', name: 'A', createdAt: '2025-03-04T05:06:07.000Z' }],
        },
        Tag: { data: [{ id: 3, label: 'x' }] },
      },
    })
    expect(rowsOf(result, 'User')[0]?.createdAt).toStrictEqual(new Date('2025-03-04T05:06:07.000Z'))
    expect(rowsOf(result, 'Tag')[0]).toStrictEqual({ id: 3, label: 'x' })
  })

  it('refuses a real value the schema does not allow, before anything is inserted', () => {
    expect(
      failure({
        count: 1,
        models: { User: { data: [{ email: 'a@example.com', name: 'A', role: 'ROOT' }] } },
      }),
    ).toBe(
      [
        'User: 1 value failed validation, nothing was inserted.',
        '   User[0].role: Invalid option: expected one of "ADMIN"|"EDITOR"|"VIEWER" (got "ROOT")',
      ].join('\n'),
    )
    expect(failure({ count: 1, models: { Tag: { data: [{ id: 'one', label: 'x' }] } } })).toBe(
      [
        'Tag: 1 value failed validation, nothing was inserted.',
        '   Tag[0].id: Invalid input: expected number, received string (got "one")',
      ].join('\n'),
    )
    expect(
      failure({
        count: 1,
        models: {
          User: {
            data: [{ id: 'not-a-uuid', createdAt: 'yesterday', email: 'ann@example', name: 'A' }],
          },
        },
      }),
    ).toBe(
      [
        'User: 3 values failed validation, nothing was inserted.',
        '   User[0].id: Invalid UUID v7 (got "not-a-uuid")',
        '   User[0].email: Invalid email address (got "ann@example")',
        '   User[0].createdAt: Invalid input: expected date, received string (got "yesterday")',
      ].join('\n'),
    )
  })

  it('refuses a real foreign key that points nowhere, and a required one left null', () => {
    expect(
      failure({
        models: { User: { count: 1 }, Post: { data: [{ title: 'x', authorId: 'nobody' }] } },
      }),
    ).toBe(
      'Post data[0].author: no User has id = "nobody".\n   Give User that row, or let the seeder pick one.',
    )
    expect(
      failure({ models: { User: { count: 1 }, Post: { data: [{ title: 'x', authorId: null }] } } }),
    ).toBe('Post data[0].author: the relation is required, but authorId is null.')
  })

  it('refuses a real row that repeats a unique value', () => {
    expect(
      failure({
        models: {
          User: {
            data: [
              { email: 'a@example.com', name: 'A' },
              { email: 'a@example.com', name: 'B' },
            ],
          },
        },
      }),
    ).toBe('User data[1]: email = "a@example.com" repeats an earlier row.')
  })

  it('links faker rows to real parents, one each for a one-to-one relation', () => {
    const result = generate({
      count: 2,
      models: {
        User: {
          data: [
            { id: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a01', email: 'a@example.com', name: 'A' },
            { id: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a02', email: 'b@example.com', name: 'B' },
            { id: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a03', email: 'c@example.com', name: 'C' },
          ],
        },
        Profile: { count: 2 },
        Post: { count: 3 },
      },
    })
    const userIds = rowsOf(result, 'Profile').map((row) => row.userId)
    expect(userIds.length).toBe(2)
    expect(new Set(userIds).size).toBe(2)
    expect(
      userIds.every((id) =>
        [
          `0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a01`,
          `0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a02`,
          `0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a03`,
        ].includes(typeof id === 'string' ? id : ''),
      ),
    ).toBe(true)
    expect(rowsOf(result, 'Post').every((row) => typeof row.authorId === 'string')).toBe(true)
  })

  it('links real rows only through what they list, while faker rows draw their own links', () => {
    const real = generate({
      models: {
        User: { data: [{ email: 'ann@example.com', name: 'Ann' }] },
        Tag: { data: [{ label: 'x' }, { label: 'y' }] },
        Post: { data: [{ title: 'a' }] },
      },
    })
    expect(rowsOf(real, '_PostToTag')).toStrictEqual([])
    const mixed = generate({
      count: 2,
      models: { Tag: { data: [{ label: 'x' }, { label: 'y' }] } },
    })
    const tagIds = new Set(rowsOf(mixed, 'Tag').map((row) => row.id))
    const postIds = new Set(rowsOf(mixed, 'Post').map((row) => row.id))
    expect(
      rowsOf(mixed, '_PostToTag').every((pair) => postIds.has(pair.A) && tagIds.has(pair.B)),
    ).toBe(true)
  })

  it('reports unknown fields in data', () => {
    expect(failure({ models: { User: { data: [{ nope: 1 }] } } })).toBe(
      'models.User.data[0].nope: User has no field named nope.',
    )
    expect(
      failure({
        models: { User: { data: [{ email: 'a@example.com', name: 'A', posts: [{ nope: 1 }] }] } },
      }),
    ).toBe('models.User.data[0].posts[0].nope: Post has no field named nope.')
    expect(failure({ models: { Post: { data: [{ title: 'x', author: 'ann' }] } } })).toBe(
      'models.Post.data[0].author: name the User row by a unique key, `{ id }` or `{ email }`, or give authorId.',
    )
  })

  it('checks generated rows the same way, so a rule cannot break the schema', () => {
    expect(failure({ count: 2, models: { User: { fields: { name: () => 42 } } } })).toBe(
      [
        'User: 2 values failed validation, nothing was inserted.',
        '   User[0].name: Invalid input: expected string, received number (got 42)',
        '   User[1].name: Invalid input: expected string, received number (got 42)',
      ].join('\n'),
    )
  })

  it('nests child rows under their parent, with no id written anywhere', () => {
    const result = generate({
      models: {
        User: {
          data: [
            {
              email: 'ann@example.com',
              name: 'Ann',
              profile: { bio: 'First programmer.' },
              posts: [
                {
                  title: 'Hello',
                  comments: [
                    { body: 'Nice.' },
                    { body: 'Thanks.', author: { email: 'bob@example.com' } },
                  ],
                },
                { title: 'Second' },
              ],
            },
            { email: 'bob@example.com', name: 'Bob' },
          ],
        },
      },
    })
    const [ann, bob] = rowsOf(result, 'User')
    const posts = rowsOf(result, 'Post')
    const comments = rowsOf(result, 'Comment')
    expect(posts.map((row) => [row.title, row.authorId])).toStrictEqual([
      ['Hello', ann?.id],
      ['Second', ann?.id],
    ])
    expect(rowsOf(result, 'Profile')).toMatchObject([{ userId: ann?.id, bio: 'First programmer.' }])
    expect(comments.map((row) => [row.body, row.postId, row.authorId])).toStrictEqual([
      ['Nice.', posts[0]?.id, null],
      ['Thanks.', posts[0]?.id, bob?.id],
    ])
  })

  it('names a parent by a unique key, and refuses one that is missing or ambiguous', () => {
    const result = generate({
      models: {
        User: {
          data: [
            { email: 'ann@example.com', name: 'Ann' },
            { email: 'bob@example.com', name: 'Bob' },
          ],
        },
        Post: { data: [{ title: 'By Bob', author: { email: 'bob@example.com' } }] },
      },
    })
    expect(rowsOf(result, 'Post')[0]?.authorId).toBe(rowsOf(result, 'User')[1]?.id)
    expect(
      failure({
        models: {
          User: { data: [{ email: 'ann@example.com', name: 'Ann' }] },
          Post: { data: [{ title: 'x', author: { email: 'nobody@example.com' } }] },
        },
      }),
    ).toBe('Post data[0].author: no User has email = "nobody@example.com".\n   Give User that row.')
    expect(
      failure({
        models: {
          User: {
            data: [
              { email: 'a@example.com', name: 'Same' },
              { email: 'b@example.com', name: 'Same' },
            ],
          },
          Post: { data: [{ title: 'x', author: { name: 'Same' } }] },
        },
      }),
    ).toBe('Post data[0].author: 2 User rows have name = "Same"; name the row by a unique key.')
  })

  it('nests a self relation and links an implicit many-to-many by key', () => {
    const result = generate({
      models: {
        User: { data: [{ email: 'ann@example.com', name: 'Ann' }] },
        Tag: { data: [{ label: 'prisma' }, { label: 'effect' }] },
        Post: { data: [{ title: 'Hello', tags: [{ label: 'effect' }, 1] }] },
        Category: {
          data: [
            {
              name: 'Engineering',
              children: [{ name: 'Databases' }, { name: 'Frontend', children: [{ name: 'CSS' }] }],
            },
          ],
        },
      },
    })
    expect(rowsOf(result, '_PostToTag')).toStrictEqual([
      { A: 1, B: 2 },
      { A: 1, B: 1 },
    ])
    expect(rowsOf(result, 'Category').map((row) => [row.name, row.parentId])).toStrictEqual([
      ['Engineering', null],
      ['Databases', 1],
      ['Frontend', 1],
      ['CSS', 3],
    ])
  })

  it('refuses a nested row that names its parent a second time', () => {
    expect(
      failure({
        models: {
          User: {
            data: [
              {
                email: 'ann@example.com',
                name: 'Ann',
                posts: [{ title: 'x', author: { email: 'ann@example.com' } }],
              },
            ],
          },
        },
      }),
    ).toBe(
      'User.posts: a nested Post row already points at its User through author; leave out author and authorId.',
    )
  })

  it('checks how many related rows each real row has, and names the row that breaks the rule', () => {
    const ok = generate({
      models: {
        User: {
          data: [
            {
              email: 'ann@example.com',
              name: 'Ann',
              profile: {},
              posts: [{ title: 'a' }, { title: 'b' }],
            },
            { email: 'bob@example.com', name: 'Bob', profile: {}, posts: [{ title: 'c' }] },
          ],
          relations: { posts: { min: 1, max: 2 }, profile: { min: 1 } },
        },
      },
    })
    expect(rowsOf(ok, 'Post').length).toBe(3)
    expect(
      failure({
        models: {
          User: {
            data: [
              {
                email: 'ann@example.com',
                name: 'Ann',
                posts: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
              },
              { email: 'bob@example.com', name: 'Bob', profile: {} },
            ],
            relations: { posts: { min: 1, max: 2 }, profile: { min: 1 } },
          },
          Tag: { data: [{ label: 'x' }], relations: { posts: { min: 1 } } },
        },
      }),
    ).toBe(
      [
        'Relations out of bounds, nothing was inserted.',
        '   User[0] { email: "ann@example.com" }.posts: 3 rows, at most 2 expected (models.User.relations.posts.max)',
        '   User[1] { email: "bob@example.com" }.posts: 0 rows, at least 1 expected (models.User.relations.posts.min)',
        '   User[0] { email: "ann@example.com" }.profile: 0 rows, at least 1 expected (models.User.relations.profile.min)',
        '   Tag[0] { label: "x" }.posts: 0 rows, at least 1 expected (models.Tag.relations.posts.min)',
      ].join('\n'),
    )
  })

  it("deals faker children out within each parent's bounds, and says when the bounds cannot hold", () => {
    const shaped = generate({
      models: {
        User: { count: 4, relations: { posts: { min: 1, max: 3 }, profile: { min: 1 } } },
        Profile: { count: 4 },
        Post: { count: 10 },
      },
    })
    const perUser = new Map<string, number>()
    for (const post of rowsOf(shaped, 'Post')) {
      const author = typeof post.authorId === 'string' ? post.authorId : ''
      perUser.set(author, (perUser.get(author) ?? 0) + 1)
    }
    expect(perUser.size).toBe(4)
    expect([...perUser.values()].every((n) => n >= 1 && n <= 3)).toBe(true)
    expect(
      failure({
        models: { User: { count: 2, relations: { posts: { max: 1 } } }, Post: { count: 3 } },
      }),
    ).toBe(
      'Post.author: every User already has 1 Post rows (models.User.relations.posts.max).\n   Lower models.Post.count or raise the max.',
    )
    const short = failure({
      models: { User: { count: 3, relations: { posts: { min: 2 } } }, Post: { count: 5 } },
    })
    expect(short.startsWith('Relations out of bounds, nothing was inserted.\n   User[')).toBe(true)
    expect(short).toContain('.posts: 1 row, at least 2 expected (models.User.relations.posts.min)')
    expect(short.split('\n').length).toBe(2)
  })
})

describe('generateSeedRows, what the rules may not say', () => {
  const ANN = '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a6b'
  const BOB = '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a6c'

  it.each([
    [
      'a model the schema does not have',
      { models: { Ghost: { count: 1 } } },
      'models.Ghost: no model named Ghost in the schema.',
    ],
    [
      'a field rule for a relation field',
      { models: { User: { fields: { posts: { min: 1 } } } } },
      'models.User.fields.posts: User has no scalar field named posts.',
    ],
    [
      'a field rule for a field that is not there',
      { models: { Post: { fields: { nope: { value: 1 } } } } },
      'models.Post.fields.nope: Post has no scalar field named nope.',
    ],
    [
      'a relation rule on a column',
      { models: { User: { relations: { email: { max: 1 } } } } },
      'models.User.relations.email: User has no relation field named email that a rule can bound (a list, or the other side of a key).',
    ],
    [
      'a relation rule on the side that owns the key',
      { models: { Post: { relations: { author: { max: 1 } } } } },
      'models.Post.relations.author: Post has no relation field named author that a rule can bound (a list, or the other side of a key).',
    ],
    [
      'a relation rule on the owning side of a one-to-one',
      { models: { Profile: { relations: { user: { min: 1 } } } } },
      'models.Profile.relations.user: Profile has no relation field named user that a rule can bound (a list, or the other side of a key).',
    ],
    [
      'a numeric rule with min above max',
      { models: { Post: { fields: { id: { min: 5, max: 4 } } } } },
      'models.Post.fields.id: min 5 is above max 4.',
    ],
    [
      'a length range with min above max',
      { models: { User: { fields: { name: { length: { min: 3, max: 1 } } } } } },
      'models.User.fields.name: length.min 3 is above length.max 1.',
    ],
    [
      'a date window the wrong way round',
      { models: { User: { fields: { createdAt: { from: '2025-02-01', to: '2025-01-01' } } } } },
      'models.User.fields.createdAt: from 2025-02-01T00:00:00.000Z is after to 2025-01-01T00:00:00.000Z.',
    ],
    [
      'a relation bound with min above max',
      { models: { User: { relations: { posts: { min: 2, max: 1 } } } } },
      'models.User.relations.posts: min 2 is above max 1.',
    ],
    [
      'a negative count',
      { models: { User: { count: -1 } } },
      'models.User.count: expected a non-negative integer, got -1.',
    ],
    [
      'a fractional count',
      { models: { User: { count: 1.5 } } },
      'models.User.count: expected a non-negative integer, got 1.5.',
    ],
    [
      'real rows next to field rules',
      { models: { Tag: { data: [{ label: 'x' }], fields: { label: { value: 'y' } } } } },
      'models.Tag: `data` and `count` / `fields` are exclusive. Give the real rows in `data`, or let faker make them with `count` and `fields`, not both.',
    ],
    [
      'an owning relation given as a bare value',
      { models: { Post: { data: [{ title: 'x', author: 3 }] } } },
      'models.Post.data[0].author: name the User row by a unique key, `{ id }` or `{ email }`, or give authorId.',
    ],
    [
      'a many-to-many field given as one value',
      { models: { Post: { data: [{ title: 'x', authorId: ANN, tags: 3 }] } } },
      'models.Post.data[0].tags: expected a list of Tag ids or keys.',
    ],
    [
      'nested rows that are not rows',
      { models: { User: { data: [{ email: 'a@example.com', name: 'A', posts: [3] }] } } },
      'models.User.data[0].posts: expected rows of Post.',
    ],
    [
      'a nested one-to-one row that is not a row',
      { models: { User: { data: [{ email: 'a@example.com', name: 'A', profile: 'x' }] } } },
      'models.User.data[0].profile: expected a row of Profile.',
    ],
    [
      'an unknown field two levels down',
      {
        models: {
          User: {
            data: [{ email: 'a@example.com', name: 'A', posts: [{ title: 'ok' }, { nope: 1 }] }],
          },
        },
      },
      'models.User.data[0].posts[1].nope: Post has no field named nope.',
    ],
  ])('refuses %s, naming the rule', (_, config, message) => {
    expect(failure(config as SeedConfig)).toBe(message)
  })

  it('lists every problem of the config at once, one per line', () => {
    expect(
      failure({
        models: {
          User: { fields: { nope: { value: 1 } }, relations: { email: { max: 1 } }, count: -2 },
          Ghost: {},
        },
      }),
    ).toBe(
      [
        'models.User.fields.nope: User has no scalar field named nope.',
        '   models.User.relations.email: User has no relation field named email that a rule can bound (a list, or the other side of a key).',
        '   models.User.count: expected a non-negative integer, got -2.',
        '   models.Ghost: no model named Ghost in the schema.',
      ].join('\n'),
    )
  })

  it('refuses a required key set to null, and a parent no key names', () => {
    expect(
      failure({
        models: {
          User: { data: [{ id: ANN, email: 'ann@example.com', name: 'Ann' }] },
          Post: { data: [{ title: 'x', authorId: null }] },
        },
      }),
    ).toBe('Post data[0].author: the relation is required, but authorId is null.')
    expect(
      failure({
        models: {
          User: { data: [{ id: ANN, email: 'ann@example.com', name: 'Ann' }] },
          Post: { data: [{ title: 'x', author: { email: 'zed@example.com' } }] },
        },
      }),
    ).toBe('Post data[0].author: no User has email = "zed@example.com".\n   Give User that row.')
    expect(
      failure({
        models: {
          User: {
            data: [
              { id: ANN, email: 'ann@example.com', name: 'Twin' },
              { id: BOB, email: 'bob@example.com', name: 'Twin' },
            ],
          },
          Post: { data: [{ title: 'x', author: { name: 'Twin' } }] },
        },
      }),
    ).toBe('Post data[0].author: 2 User rows have name = "Twin"; name the row by a unique key.')
  })

  it('refuses a second one-to-one row for the same parent, as the unique key it repeats', () => {
    expect(
      failure({
        models: {
          User: { data: [{ id: ANN, email: 'ann@example.com', name: 'Ann' }] },
          Profile: { data: [{ user: { id: ANN } }, { user: { email: 'ann@example.com' } }] },
        },
      }),
    ).toBe(`Profile data[1]: userId = "${ANN}" repeats an earlier row.`)
    expect(
      failure({
        models: {
          User: {
            data: [{ id: ANN, email: 'ann@example.com', name: 'Ann', profile: [{}, { bio: 'b' }] }],
          },
        },
      }),
    ).toBe(`Profile data[1]: userId = "${ANN}" repeats an earlier row.`)
  })

  it('refuses a link to a partner that is not there, by id and by key, and links only what exists', () => {
    expect(
      failure({
        models: {
          User: { data: [{ id: ANN, email: 'ann@example.com', name: 'Ann' }] },
          Tag: { data: [{ label: 'a' }] },
          Post: { data: [{ title: 'x', author: { id: ANN }, tags: [1, 99] }] },
        },
      }),
    ).toBe('Post data[0].tags: no Tag has id = 99.\n   Give Tag that row.')
    expect(
      failure({
        models: {
          User: { data: [{ id: ANN, email: 'ann@example.com', name: 'Ann' }] },
          Tag: { data: [] },
          Post: { data: [{ title: 'x', author: { id: ANN }, tags: [{ label: 'a' }] }] },
        },
      }),
    ).toBe('Post data[0].tags: no Tag has label = "a".\n   Give Tag that row.')
    const linked = generate({
      models: {
        User: { data: [{ id: ANN, email: 'ann@example.com', name: 'Ann' }] },
        Tag: { data: [{ label: 'a' }, { label: 'b' }] },
        Post: { data: [{ title: 'x', author: { id: ANN }, tags: [{ label: 'b' }, 1] }] },
      },
    })
    expect(rowsOf(linked, '_PostToTag')).toStrictEqual([
      { A: 1, B: 2 },
      { A: 1, B: 1 },
    ])
  })

  it('names a self parent by key, and refuses one that is missing', () => {
    const made = generate({
      models: {
        Category: { data: [{ name: 'Root' }, { name: 'Leaf', parent: { name: 'Root' } }] },
      },
    })
    expect(rowsOf(made, 'Category')).toStrictEqual([
      { id: 1, name: 'Root', parentId: null },
      { id: 2, name: 'Leaf', parentId: 1 },
    ])
    expect(
      failure({
        models: { Category: { data: [{ name: 'Leaf', parent: { name: 'Nope' } }] } },
      }),
    ).toBe('Category data[0].parent: no Category has name = "Nope".\n   Give Category that row.')
  })

  it('links a composite key by its scalars, and names both columns when no parent has them', () => {
    const made = generate({
      models: {
        Warehouse: { data: [{ country: 'JP', code: 'TYO' }] },
        Stock: { data: [{ country: 'JP', code: 'TYO' }, { warehouse: { code: 'TYO' } }] },
      },
    })
    expect(rowsOf(made, 'Stock')).toStrictEqual([
      { id: 1, country: 'JP', code: 'TYO' },
      { id: 2, country: 'JP', code: 'TYO' },
    ])
    expect(
      failure({
        models: {
          Warehouse: { data: [{ country: 'JP', code: 'TYO' }] },
          Stock: { data: [{ country: 'JP', code: 'OSA' }] },
        },
      }),
    ).toBe(
      'Stock data[0].warehouse: no Warehouse has country, code = "JP", "OSA".\n   Give Warehouse that row, or let the seeder pick one.',
    )
  })

  it('refuses a repeated composite id in real rows', () => {
    expect(
      failure({
        models: {
          User: {
            data: [
              { id: ANN, email: 'ann@example.com', name: 'Ann' },
              { id: BOB, email: 'bob@example.com', name: 'Bob' },
            ],
          },
          Follow: {
            data: [
              { follower: { id: ANN }, following: { id: BOB } },
              { follower: { email: 'ann@example.com' }, following: { email: 'bob@example.com' } },
            ],
          },
        },
      }),
    ).toBe(`Follow data[1]: followerId, followingId = "${ANN}", "${BOB}" repeats an earlier row.`)
  })

  it('stops when every parent is at its max, and when a required parent model has no rows', () => {
    expect(
      failure({
        models: { User: { count: 1, relations: { posts: { max: 2 } } }, Post: { count: 3 } },
      }),
    ).toBe(
      'Post.author: every User already has 2 Post rows (models.User.relations.posts.max).\n   Lower models.Post.count or raise the max.',
    )
    expect(failure({ models: { User: { count: 0 }, Post: { count: 2 } } })).toBe(
      'Post.author requires a User row, but User has none. Give User a count.',
    )
    expect(failure({ models: { User: { data: [] }, Post: { count: 1 } } })).toBe(
      'Post.author requires a User row, but User has none. Give User a count.',
    )
  })

  it('reports a min that faker cannot reach because the child count is too low', () => {
    expect(
      failure({
        models: { User: { count: 3, relations: { posts: { min: 2 } } }, Post: { count: 3 } },
      }),
    ).toMatch(
      /^Relations out of bounds, nothing was inserted\.\n( {3}User\[\d\] \{ email: "[^"]+" \}\.posts: [01] rows?, at least 2 expected \(models\.User\.relations\.posts\.min\)\n?)+$/u,
    )
  })

  it('checks the bounds of real rows on both sides of a many-to-many', () => {
    expect(
      failure({
        models: {
          User: { data: [{ id: ANN, email: 'ann@example.com', name: 'Ann' }] },
          Tag: { data: [{ label: 'a' }], relations: { posts: { max: 2 } } },
          Post: {
            data: [
              { title: 'x', author: { id: ANN }, tags: [{ label: 'a' }] },
              { title: 'y', author: { id: ANN }, tags: [{ label: 'a' }] },
              { title: 'z', author: { id: ANN }, tags: [{ label: 'a' }] },
            ],
            relations: { tags: { min: 1 } },
          },
        },
      }),
    ).toBe(
      'Relations out of bounds, nothing was inserted.\n   Tag[0] { label: "a" }.posts: 3 rows, at most 2 expected (models.Tag.relations.posts.max)',
    )
  })

  it('makes the same rows twice for the same seed in data mode, nesting and keys included', () => {
    // Without a window the dates hang off the clock, so the window pins them.
    const config: SeedConfig = {
      dates: { from: '2025-01-01', to: '2025-12-31' },
      models: {
        User: {
          data: [
            {
              email: 'ann@example.com',
              name: 'Ann',
              profile: { bio: 'hi' },
              posts: [{ title: 'a' }, { title: 'b' }],
            },
            {
              email: 'bob@example.com',
              name: 'Bob',
              posts: [{ title: 'c', tags: [{ label: 'a' }] }],
            },
          ],
        },
        Tag: { data: [{ label: 'a' }, { label: 'b' }] },
        Comment: { count: 5 },
      },
    }
    expect(generate(config, 11)).toStrictEqual(generate(config, 11))
    expect(rowsOf(generate(config, 11), 'Comment')).not.toStrictEqual(
      rowsOf(generate(config, 12), 'Comment'),
    )
    const users = rowsOf(generate(config, 11), 'User')
    const posts = rowsOf(generate(config, 11), 'Post')
    expect(posts.map((post) => post.authorId)).toStrictEqual([
      users[0]?.id,
      users[0]?.id,
      users[1]?.id,
    ])
    expect(rowsOf(generate(config, 11), '_PostToTag')).toStrictEqual([{ A: 3, B: 1 }])
  })

  it('takes a count of zero as no rows, every other table staying empty as well', () => {
    const made = generate({ models: { User: { count: 0 } } })
    expect(made.map((entry) => entry.table.name)).toStrictEqual([
      'User',
      'Profile',
      'Post',
      'Tag',
      'Comment',
      'Follow',
      'Category',
      'Warehouse',
      'Stock',
      '_PostToTag',
    ])
    expect(made.every((entry) => entry.rows.length === 0)).toBe(true)
  })
})
