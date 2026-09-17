import { describe, expect, it } from 'vite-plus/test'

import { makeClientTouched } from './client-touched.js'

const scalar = (name: string) => ({ name, kind: 'scalar', type: 'String' })
const relation = (name: string, type: string) => ({ name, kind: 'object', type })

const MODELS = [
  {
    name: 'User',
    fields: [
      scalar('id'),
      scalar('email'),
      { name: 'role', kind: 'enum', type: 'Role' },
      scalar('at'),
      relation('posts', 'Post'),
      relation('profile', 'Profile'),
      relation('manager', 'User'),
      relation('reports', 'User'),
    ],
  },
  {
    name: 'Post',
    fields: [scalar('id'), scalar('title'), scalar('published'), relation('author', 'User')],
  },
  { name: 'Profile', fields: [scalar('bio'), relation('user', 'User')] },
]

describe('makeClientTouched', () => {
  it.each([
    ['a call without arguments', 'User', undefined, [{ model: 'User', fields: [] }]],
    [
      'the scalars a filter names, through its operators',
      'User',
      { where: { email: { contains: 'a' }, AND: [{ role: 'ADMIN' }, { NOT: { id: 1 } }] } },
      [{ model: 'User', fields: ['email', 'role', 'id'] }],
    ],
    [
      'the model an include reaches',
      'User',
      { include: { posts: true } },
      [
        { model: 'User', fields: ['posts'] },
        { model: 'Post', fields: [] },
      ],
    ],
    [
      'the fields selected under a relation, as that model’s',
      'User',
      { select: { email: true, posts: { select: { title: true }, where: { published: true } } } },
      [
        { model: 'User', fields: ['email', 'posts'] },
        { model: 'Post', fields: ['title', 'published'] },
      ],
    ],
    [
      'relation filters, back to the model they started from',
      'User',
      { where: { posts: { some: { published: true, author: { is: { email: 'x' } } } } } },
      [
        { model: 'User', fields: ['posts', 'email'] },
        { model: 'Post', fields: ['published', 'author'] },
      ],
    ],
    [
      'a relation counted under _count',
      'User',
      { select: { _count: { select: { posts: true } } } },
      [
        { model: 'User', fields: ['posts'] },
        { model: 'Post', fields: [] },
      ],
    ],
    [
      'the fields a groupBy groups by and a distinct keeps, written as strings',
      'User',
      { by: ['role', 'nope'], distinct: 'email', _count: { _all: true } },
      [{ model: 'User', fields: ['role', 'email'] }],
    ],
    [
      'the fields a nested write sets',
      'User',
      {
        data: { email: 'x', posts: { create: [{ title: 'a' }] }, profile: { create: { bio: '' } } },
      },
      [
        { model: 'User', fields: ['email', 'posts', 'profile'] },
        { model: 'Post', fields: ['title'] },
        { model: 'Profile', fields: ['bio'] },
      ],
    ],
    [
      'an order, a date and a null, which name only their fields',
      'Post',
      { orderBy: [{ title: 'asc' }], where: { author: { at: { gte: new Date(0) } }, title: null } },
      [
        { model: 'Post', fields: ['title', 'author'] },
        { model: 'User', fields: ['at'] },
      ],
    ],
    [
      'nothing for keys that are neither an argument the model knows nor one of its fields',
      'User',
      // cspell:ignore emial
      { where: { emial: 'x', posts: { every: { nope: 1 } } }, take: 10 },
      [
        { model: 'User', fields: ['posts'] },
        { model: 'Post', fields: [] },
      ],
    ],
    [
      'a relation back to the same model, as that model again',
      'User',
      {
        where: { manager: { is: { email: 'boss' } } },
        include: { reports: { select: { id: true } } },
      },
      [{ model: 'User', fields: ['manager', 'email', 'reports', 'id'] }],
    ],
    [
      'the fields a nested connect, connectOrCreate and upsert name',
      'Post',
      {
        where: { id: 1 },
        create: { title: 'a', author: { connect: { email: 'x' } } },
        update: {
          author: {
            connectOrCreate: { where: { id: 1 }, create: { email: 'y' } },
            upsert: { create: { email: 'z' }, update: { role: 'ADMIN' } },
          },
        },
      },
      [
        { model: 'Post', fields: ['id', 'title', 'author'] },
        { model: 'User', fields: ['email', 'id', 'role'] },
      ],
    ],
    [
      'an order by the count of a relation, and the fields omitted',
      'User',
      { orderBy: [{ posts: { _count: 'desc' } }, { email: 'asc' }], omit: { role: true } },
      [
        { model: 'User', fields: ['posts', 'email', 'role'] },
        { model: 'Post', fields: [] },
      ],
    ],
    [
      'an aggregate and a groupBy with having, through the fields they name under their operators',
      'Post',
      { by: 'title', _sum: { id: true }, having: { published: { equals: true } } },
      [{ model: 'Post', fields: ['title', 'id', 'published'] }],
    ],
  ])('reads %s', (_, model, args, touched) => {
    expect(makeClientTouched({ calls: [{ model, args }], models: MODELS })).toStrictEqual(touched)
  })

  it('reads every call of a batch, a model once with every field its calls name', () => {
    expect(
      makeClientTouched({
        calls: [
          { model: 'User', args: { where: { email: 'a' } } },
          { model: 'Post', args: { where: { author: { role: 'ADMIN' } } } },
          { model: 'User', args: { select: { id: true, email: true } } },
        ],
        models: MODELS,
      }),
    ).toStrictEqual([
      { model: 'User', fields: ['email', 'role', 'id'] },
      { model: 'Post', fields: ['author'] },
    ])
  })

  it('reaches no model the schema does not have, and still lists the call’s own', () => {
    expect(
      makeClientTouched({
        calls: [{ model: 'Ghost', args: { include: { posts: true } } }],
        models: [...MODELS, { name: 'Other', fields: [relation('ghost', 'Missing')] }],
      }),
    ).toStrictEqual([{ model: 'Ghost', fields: [] }])
    expect(
      makeClientTouched({
        calls: [{ model: 'Other', args: { include: { ghost: { select: { a: true } } } } }],
        models: [{ name: 'Other', fields: [relation('ghost', 'Missing')] }],
      }),
    ).toStrictEqual([{ model: 'Other', fields: ['ghost'] }])
  })

  it('reads arguments nested as deep as the parser lets them, without running out of stack', () => {
    // The parser refuses arguments deeper than 256 levels; each AND is two here.
    const deep = Array.from({ length: 120 }).reduce<unknown>((inner) => ({ AND: [inner] }), {
      email: 'x',
    })
    expect(
      makeClientTouched({ calls: [{ model: 'User', args: { where: deep } }], models: MODELS }),
    ).toStrictEqual([{ model: 'User', fields: ['email'] }])
  })

  it('reads nothing of an empty query', () => {
    expect(makeClientTouched({ calls: [], models: MODELS })).toStrictEqual([])
  })
})
