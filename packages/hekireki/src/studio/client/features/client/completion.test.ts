import { describe, expect, it } from 'vite-plus/test'

import { suggestionsAt } from './completion.js'
import { contextAt } from './cursor.js'

const MODELS = [
  {
    name: 'User',
    fields: [
      { name: 'id', type: 'Int', kind: 'scalar', isList: false },
      { name: 'email', type: 'String', kind: 'scalar', isList: false },
      { name: 'role', type: 'Role', kind: 'enum', isList: false },
      { name: 'posts', type: 'Post', kind: 'object', isList: true },
      { name: 'profile', type: 'Profile', kind: 'object', isList: false },
    ],
  },
  {
    name: 'Post',
    fields: [
      { name: 'id', type: 'Int', kind: 'scalar', isList: false },
      { name: 'title', type: 'String', kind: 'scalar', isList: false },
      { name: 'author', type: 'User', kind: 'object', isList: false },
    ],
  },
  {
    name: 'Profile',
    fields: [{ name: 'bio', type: 'String', kind: 'scalar', isList: false }],
  },
]

/** The context at the `|` of the text, the bar taken out. */
function at(marked: string) {
  const cursor = marked.indexOf('|')
  return contextAt(marked.replace('|', ''), cursor)
}

function labels(marked: string) {
  const context = at(marked)
  return context === null ? null : suggestionsAt(context, MODELS).map((entry) => entry.label)
}

describe('contextAt', () => {
  it('finds the delegate, the operation and the keys that lead to the cursor', () => {
    expect(at('prisma.us|')).toStrictEqual({ kind: 'delegate', from: 7 })
    expect(at('await prisma.|')).toStrictEqual({ kind: 'delegate', from: 13 })
    expect(at('prisma.user.fi|')).toStrictEqual({ kind: 'operation', delegate: 'user', from: 12 })
    expect(at('prisma.$transaction([prisma.post.|')).toStrictEqual({
      kind: 'operation',
      delegate: 'post',
      from: 33,
    })
    expect(at('prisma.user.findMany({ |')).toStrictEqual({
      kind: 'key',
      delegate: 'user',
      operation: 'findMany',
      path: [],
      from: 23,
    })
    expect(
      at('prisma.user.findMany({ where: { "posts": { some: { title: "a", ti| } } } })'),
    ).toStrictEqual({
      kind: 'key',
      delegate: 'user',
      operation: 'findMany',
      path: ['where', 'posts', 'some'],
      from: 63,
    })
    expect(at('prisma.user.findMany({ orderBy: [{ id: "asc" }, { |')).toStrictEqual({
      kind: 'key',
      delegate: 'user',
      operation: 'findMany',
      path: ['orderBy'],
      from: 50,
    })
  })

  it('stays out of values, strings, comments and closed calls', () => {
    expect(at('prisma.user.findMany({ take: |')).toBeNull()
    expect(at('prisma.user.findMany({ where: { email: "a.|')).toBeNull()
    expect(at('prisma.user.findMany() // prisma.|')).toBeNull()
    expect(at('prisma.user.findMany({ }) {|')).toBeNull()
    expect(at('prisma.user.findMany({ at: new Date(|')).toBeNull()
    expect(at('|')).toBeNull()
  })
})

describe('suggestionsAt', () => {
  it('offers the delegates, then the operations of a known delegate', () => {
    expect(labels('prisma.|')).toStrictEqual(['user', 'post', 'profile', '$transaction'])
    expect(labels('prisma.user.|')?.slice(0, 3)).toStrictEqual([
      'findMany',
      'findFirst',
      'findFirstOrThrow',
    ])
    expect(labels('prisma.usr.|')).toStrictEqual([])
  })

  it('offers the arguments the operation takes', () => {
    expect(labels('prisma.user.create({ |')).toStrictEqual(['data', 'select', 'include', 'omit'])
    expect(labels('prisma.user.deleteMany({ |')).toStrictEqual(['where', 'limit'])
  })

  it('follows where through relations, filters and combinators', () => {
    expect(labels('prisma.user.findMany({ where: { |')).toStrictEqual([
      'id',
      'email',
      'role',
      'posts',
      'profile',
      'AND',
      'OR',
      'NOT',
    ])
    expect(labels('prisma.user.findMany({ where: { posts: { |')).toStrictEqual([
      'some',
      'every',
      'none',
    ])
    expect(labels('prisma.user.findMany({ where: { posts: { every: { |')).toStrictEqual([
      'id',
      'title',
      'author',
      'AND',
      'OR',
      'NOT',
    ])
    expect(labels('prisma.user.findMany({ where: { profile: { |')).toStrictEqual([
      'is',
      'isNot',
      'bio',
    ])
    expect(labels('prisma.user.findMany({ where: { OR: [{ role: { |')).toStrictEqual([
      'equals',
      'not',
      'in',
      'notIn',
    ])
    expect(labels('prisma.user.findMany({ where: { id: { not: { |')).toStrictEqual([
      'equals',
      'not',
      'in',
      'notIn',
      'lt',
      'lte',
      'gt',
      'gte',
    ])
  })

  it('follows select and include into the related model', () => {
    expect(labels('prisma.post.findMany({ include: { |')).toStrictEqual(['author', '_count'])
    expect(labels('prisma.user.findMany({ include: { posts: { |')).toStrictEqual([
      'select',
      'include',
      'omit',
      'where',
      'orderBy',
      'cursor',
      'take',
      'skip',
      'distinct',
    ])
    expect(labels('prisma.post.findMany({ select: { author: { select: { |')).toStrictEqual([
      'id',
      'email',
      'role',
      'posts',
      'profile',
      '_count',
    ])
    expect(labels('prisma.user.findMany({ select: { _count: { select: { |')).toStrictEqual([
      'posts',
    ])
  })

  it('follows data into nested writes', () => {
    expect(labels('prisma.user.create({ data: { posts: { |')).toStrictEqual([
      'create',
      'createMany',
      'connect',
      'connectOrCreate',
      'disconnect',
      'set',
      'delete',
      'deleteMany',
      'update',
      'updateMany',
      'upsert',
    ])
    expect(labels('prisma.user.create({ data: { posts: { create: { |')).toStrictEqual([
      'id',
      'title',
      'author',
    ])
    expect(labels('prisma.post.update({ data: { author: { connect: { |')).toStrictEqual([
      'id',
      'email',
      'role',
      'posts',
      'profile',
      'AND',
      'OR',
      'NOT',
    ])
  })

  it('offers the scalar fields to aggregate and nothing where only a value fits', () => {
    expect(labels('prisma.post.aggregate({ _max: { |')).toStrictEqual(['id', 'title'])
    expect(labels('prisma.user.findMany({ take: { |')).toStrictEqual([])
  })
})

describe('suggestionsAt through every input type', () => {
  const TYPED = [
    {
      name: 'Item',
      fields: [
        { name: 'id', type: 'Int', kind: 'scalar', isList: false },
        { name: 'title', type: 'String', kind: 'scalar', isList: false },
        { name: 'tags', type: 'String', kind: 'scalar', isList: true },
        { name: 'meta', type: 'Json', kind: 'scalar', isList: false },
        { name: 'score', type: 'Float', kind: 'scalar', isList: false },
        { name: 'active', type: 'Boolean', kind: 'scalar', isList: false },
        { name: 'owner', type: 'Owner', kind: 'object', isList: false },
        { name: 'parts', type: 'Part', kind: 'object', isList: true },
      ],
    },
    { name: 'Owner', fields: [{ name: 'name', type: 'String', kind: 'scalar', isList: false }] },
    { name: 'Part', fields: [{ name: 'code', type: 'String', kind: 'scalar', isList: false }] },
  ]

  function offered(marked: string) {
    const context = contextAt(marked.replace('|', ''), marked.indexOf('|'))
    return context === null ? null : suggestionsAt(context, TYPED).map((entry) => entry.label)
  }

  it.each([
    [
      'title',
      [
        'equals',
        'not',
        'in',
        'notIn',
        'contains',
        'startsWith',
        'endsWith',
        'mode',
        'lt',
        'lte',
        'gt',
        'gte',
      ],
    ],
    ['tags', ['has', 'hasEvery', 'hasSome', 'isEmpty', 'equals']],
    ['meta', ['equals', 'not', 'path', 'string_contains', 'array_contains']],
    ['score', ['equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte']],
    ['active', ['equals', 'not']],
  ])('offers the filters of a %s field', (field, filters) => {
    expect(offered(`prisma.item.findMany({ where: { ${field}: { |`)).toStrictEqual(filters)
  })

  it('offers nothing under a filter but `not`, and nothing under a key it does not know', () => {
    expect(offered('prisma.item.findMany({ where: { title: { contains: { |')).toStrictEqual([])
    expect(offered('prisma.item.findMany({ where: { nope: { |')).toStrictEqual([])
    expect(offered('prisma.item.findMany({ where: { parts: { most: { |')).toStrictEqual([])
    expect(offered('prisma.item.findMany({ nope: { |')).toStrictEqual([])
    expect(offered('prisma.item.nope({ |')).toStrictEqual([])
  })

  it('follows a to-one relation through is / isNot, and the combinators under it', () => {
    expect(offered('prisma.item.findMany({ where: { owner: { is: { |')).toStrictEqual([
      'name',
      'AND',
      'OR',
      'NOT',
    ])
    expect(offered('prisma.item.findMany({ where: { owner: { AND: [{ |')).toStrictEqual([
      'name',
      'AND',
      'OR',
      'NOT',
    ])
  })

  it('offers _count under an aggregate, not under a count, and the relations under _count.select', () => {
    expect(offered('prisma.item.aggregate({ _count: { |')).toStrictEqual([
      'id',
      'title',
      'tags',
      'meta',
      'score',
      'active',
    ])
    expect(offered('prisma.item.count({ _count: { |')).toStrictEqual([])
    expect(offered('prisma.item.findMany({ include: { _count: { |')).toStrictEqual(['select'])
    expect(offered('prisma.item.findMany({ include: { _count: { select: { |')).toStrictEqual([
      'parts',
    ])
    expect(offered('prisma.item.findMany({ include: { _count: { where: { |')).toStrictEqual([])
  })

  it('offers the arguments of a to-one relation in select, and follows them in', () => {
    expect(offered('prisma.item.findMany({ select: { owner: { |')).toStrictEqual([
      'select',
      'include',
      'omit',
    ])
    expect(offered('prisma.item.findMany({ include: { parts: { where: { |')).toStrictEqual([
      'code',
      'AND',
      'OR',
      'NOT',
    ])
    expect(offered('prisma.item.findMany({ select: { title: { |')).toStrictEqual([])
  })

  it('orders by the fields of a to-one relation, and by the count of a list one', () => {
    expect(offered('prisma.item.findMany({ orderBy: { |')).toStrictEqual([
      'id',
      'title',
      'tags',
      'meta',
      'score',
      'active',
      'owner',
      'parts',
    ])
    expect(offered('prisma.item.findMany({ orderBy: { owner: { |')).toStrictEqual(['name'])
    expect(offered('prisma.item.findMany({ orderBy: { parts: { |')).toStrictEqual(['code'])
    expect(offered('prisma.item.findMany({ orderBy: { title: { |')).toStrictEqual([])
  })

  it('offers the omittable scalars, and nothing further under one', () => {
    expect(offered('prisma.item.findMany({ omit: { |')).toStrictEqual([
      'id',
      'title',
      'tags',
      'meta',
      'score',
      'active',
    ])
    expect(offered('prisma.item.findMany({ omit: { title: { |')).toStrictEqual([])
  })

  it('offers the nested writes of a to-one relation and follows each one in', () => {
    expect(offered('prisma.item.update({ data: { owner: { |')).toStrictEqual([
      'create',
      'connect',
      'connectOrCreate',
      'disconnect',
      'delete',
      'update',
      'upsert',
    ])
    expect(offered('prisma.item.update({ data: { owner: { update: { |')).toStrictEqual(['name'])
    expect(offered('prisma.item.update({ data: { owner: { upsert: { |')).toStrictEqual([
      'where',
      'create',
      'update',
      'data',
      'skipDuplicates',
    ])
    expect(
      offered('prisma.item.update({ data: { owner: { connectOrCreate: { create: { |'),
    ).toStrictEqual(['name'])
    expect(offered('prisma.item.update({ data: { parts: { update: { |')).toStrictEqual([
      'where',
      'create',
      'update',
      'data',
      'skipDuplicates',
    ])
    expect(offered('prisma.item.update({ data: { parts: { createMany: { data: { |')).toStrictEqual([
      'code',
    ])
    expect(offered('prisma.item.update({ data: { parts: { set: [{ |')).toStrictEqual([
      'code',
      'AND',
      'OR',
      'NOT',
    ])
    expect(offered('prisma.item.update({ data: { parts: { move: { |')).toStrictEqual([])
    expect(offered('prisma.item.update({ data: { title: { |')).toStrictEqual([])
  })

  it('offers upsert its arguments and follows create and update into the data of the model', () => {
    expect(offered('prisma.item.upsert({ |')).toStrictEqual([
      'where',
      'create',
      'update',
      'select',
      'include',
      'omit',
    ])
    expect(offered('prisma.item.upsert({ create: { |')).toStrictEqual([
      'id',
      'title',
      'tags',
      'meta',
      'score',
      'active',
      'owner',
      'parts',
    ])
  })

  it('tells each operation apart as a read or a write, with what it does', () => {
    const context = contextAt('prisma.item.', 12)
    expect(context === null ? [] : suggestionsAt(context, TYPED).slice(0, 2)).toStrictEqual([
      { label: 'findMany', detail: 'read · every matching row', kind: 'operation' },
      { label: 'findFirst', detail: 'read · the first matching row, or null', kind: 'operation' },
    ])
    expect(
      context === null
        ? []
        : suggestionsAt(context, TYPED)
            .filter((entry) => entry.detail.startsWith('write'))
            .map((entry) => entry.label),
    ).toStrictEqual([
      'create',
      'createMany',
      'createManyAndReturn',
      'update',
      'updateMany',
      'updateManyAndReturn',
      'upsert',
      'delete',
      'deleteMany',
    ])
  })
})

describe('contextAt at the edges', () => {
  it('stays out of an open block comment, a closed call, a value list and a paren', () => {
    expect(contextAt('prisma.user.findMany({ /* where: { ', 35)).toBeNull()
    expect(contextAt('prisma.user.findMany({ where: { id: { in: [', 42)).toBeNull()
    expect(contextAt('prisma.user.findMany({ where: { at: new Date(', 45)).toBeNull()
    expect(contextAt('prisma.$transaction(', 20)).toBeNull()
    expect(contextAt('foo({ ', 6)).toBeNull()
  })

  it('reads a key after a closed block comment, and inside a call in a $transaction', () => {
    expect(contextAt('prisma.user.findMany({ /* note */ ', 34)).toStrictEqual({
      kind: 'key',
      delegate: 'user',
      operation: 'findMany',
      path: [],
      from: 34,
    })
    expect(
      contextAt('prisma.$transaction([prisma.post.count(), prisma.user.findMany({ ', 65),
    ).toStrictEqual({ kind: 'key', delegate: 'user', operation: 'findMany', path: [], from: 65 })
  })

  it('does not take a member of a member for a delegate', () => {
    expect(contextAt('prisma.user.findMany.x.', 23)).toStrictEqual({
      kind: 'operation',
      delegate: 'x',
      from: 23,
    })
    expect(contextAt('a.b.c', 5)).toStrictEqual({ kind: 'operation', delegate: 'b', from: 4 })
  })
})
