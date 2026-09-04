import { describe, expect, it } from 'vite-plus/test'

import { autoLayout, diagramFields, NODE_WIDTH, nodeHeight, positionsFor } from './layout.js'

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum'
  readonly documentation: string | null
}

type Index = { readonly type: 'id' | 'normal' | 'unique' | 'fulltext'; readonly fields: string[] }

type Model = {
  readonly name: string
  readonly fields: readonly Field[]
  readonly indexes?: readonly Index[]
}

type Relation = {
  readonly from: { readonly model: string }
  readonly to: { readonly model: string }
}

type Enum = { readonly name: string; readonly values: readonly unknown[] }

type Schema = {
  readonly models: readonly Model[]
  readonly relations: readonly Relation[]
  readonly enums?: readonly Enum[]
}

function schema(models: Model[], relations: Relation[] = [], enums: Enum[] = []): Schema {
  return { models, relations, enums }
}

function field(name: string, kind: Field['kind'] = 'scalar'): Field {
  return { name, kind, documentation: null }
}

function model(name: string, fields: Field[], indexes: Index[] = []): Model {
  return { name, fields, indexes }
}

function relation(from: string, to: string): Relation {
  return { from: { model: from }, to: { model: to } }
}

describe('diagramFields', () => {
  it('drops relation fields', () => {
    expect(
      diagramFields(model('A', [field('id'), field('other', 'object'), field('role', 'enum')])).map(
        (f) => f.name,
      ),
    ).toStrictEqual(['id', 'role'])
  })
})

describe('nodeHeight', () => {
  it('grows by one row per field and an extra line per description', () => {
    expect(nodeHeight(model('A', []))).toBe(52)
    expect(nodeHeight(model('A', [field('a'), field('b'), field('c')]))).toBe(118)
    expect(
      nodeHeight(model('A', [{ ...field('a'), documentation: 'Primary key' }, field('b')])),
    ).toBe(110)
    expect(nodeHeight(model('A', [{ ...field('a'), documentation: '   ' }]))).toBe(74)
  })

  it('adds a row per block constraint, under a padded rule', () => {
    const one = model('A', [field('a')], [{ type: 'unique', fields: ['a'] }])
    const two = model(
      'A',
      [field('a')],
      [
        { type: 'unique', fields: ['a'] },
        { type: 'normal', fields: ['a'] },
      ],
    )
    expect(nodeHeight(one)).toBe(74 + 20 + 8)
    expect(nodeHeight(two)).toBe(74 + 40 + 8)
  })
})

describe('autoLayout', () => {
  it('positions every model without overlap and parents left of children', () => {
    const models = [
      model('User', [field('id')]),
      model('Post', [field('id'), field('authorId')]),
      model('Tag', [field('id')]),
    ]
    const positions = autoLayout(
      schema(models, [relation('User', 'Post'), relation('Post', 'Tag')]),
    )
    expect(Object.keys(positions).toSorted()).toStrictEqual(['Post', 'Tag', 'User'])
    const user = positions.User
    const post = positions.Post
    const tag = positions.Tag
    if (!(user && post && tag)) throw new Error('positions')
    expect(post.x - user.x).toBeGreaterThanOrEqual(NODE_WIDTH)
    expect(tag.x - post.x).toBeGreaterThanOrEqual(NODE_WIDTH)
  })

  it('ignores self relations and relations to unknown models', () => {
    const models = [model('Category', [field('id'), field('parentId')])]
    expect(
      autoLayout(schema(models, [relation('Category', 'Category'), relation('Category', 'Ghost')])),
    ).toStrictEqual({ Category: { x: 40, y: 40 } })
  })

  it('places unrelated models in a single column', () => {
    expect(
      autoLayout(schema([model('A', [field('id')]), model('B', [field('id')])])),
    ).toStrictEqual({
      A: { x: 40, y: 40 },
      B: { x: 40, y: 170 },
    })
  })
})

describe('positionsFor', () => {
  const canvas = schema(
    [model('User', [field('id')]), model('Post', [field('id'), field('authorId')])],
    [relation('User', 'Post')],
  )

  it('returns the stored positions untouched when every block has one', () => {
    const stored = { User: { x: 1, y: 2 }, Post: { x: 300, y: 2 } }
    expect(positionsFor(canvas, stored)).toStrictEqual(stored)
  })

  it('fills missing blocks from auto layout and keeps stored ones', () => {
    const computed = autoLayout(canvas)
    expect(positionsFor(canvas, { User: { x: 1, y: 2 } })).toStrictEqual({
      User: { x: 1, y: 2 },
      Post: computed.Post,
    })
  })

  it('drops positions of blocks that no longer exist', () => {
    expect(
      positionsFor(canvas, { User: { x: 1, y: 2 }, Post: { x: 3, y: 4 }, Ghost: { x: 9, y: 9 } }),
    ).toStrictEqual({ User: { x: 1, y: 2 }, Post: { x: 3, y: 4 } })
  })

  it('places the enum cards too', () => {
    const withEnum = schema(
      [model('User', [{ name: 'role', kind: 'enum', documentation: null }])],
      [],
      [{ name: 'Role', values: ['ADMIN', 'VIEWER'] }],
    )
    expect(Object.keys(positionsFor(withEnum, {})).toSorted()).toStrictEqual(['Role', 'User'])
  })
})
