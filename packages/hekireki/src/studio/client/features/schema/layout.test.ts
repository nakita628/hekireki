import { describe, expect, it } from 'vite-plus/test'

import type { Field, Model, Relation, Schema } from '../../../server/routes/index.js'
import { autoLayout, diagramFields, NODE_WIDTH, nodeHeight, positionsFor } from './layout.js'

function field(name: string, kind: Field['kind'] = 'scalar'): Field {
  return {
    name,
    dbName: null,
    kind,
    type: kind === 'object' ? 'Other' : 'String',
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
  }
}

function model(name: string, fields: Field[]): Model {
  return {
    name,
    dbName: null,
    documentation: null,
    annotations: [],
    fields,
    primaryKey: null,
    indexes: [],
    attributes: [],
    location: null,
  }
}

function relation(from: string, to: string): Relation {
  return {
    id: `${from}.id->${to}.fk`,
    name: null,
    origin: 'inferred',
    from: { model: from, field: 'id', cardinality: 'one' },
    to: { model: to, field: 'fk', cardinality: 'many' },
    onDelete: null,
    onUpdate: null,
  }
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
    expect(nodeHeight([])).toBe(52)
    expect(nodeHeight([field('a'), field('b'), field('c')])).toBe(118)
    expect(nodeHeight([{ ...field('a'), documentation: 'Primary key' }, field('b')])).toBe(110)
    expect(nodeHeight([{ ...field('a'), documentation: '   ' }])).toBe(74)
  })
})

describe('autoLayout', () => {
  it('positions every model without overlap and parents left of children', () => {
    const models = [
      model('User', [field('id')]),
      model('Post', [field('id'), field('authorId')]),
      model('Tag', [field('id')]),
    ]
    const positions = autoLayout(models, [relation('User', 'Post'), relation('Post', 'Tag')])
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
      autoLayout(models, [relation('Category', 'Category'), relation('Category', 'Ghost')]),
    ).toStrictEqual({ Category: { x: 40, y: 40 } })
  })

  it('places unrelated models in a single column', () => {
    expect(autoLayout([model('A', [field('id')]), model('B', [field('id')])], [])).toStrictEqual({
      A: { x: 40, y: 40 },
      B: { x: 40, y: 162 },
    })
  })
})

describe('positionsFor', () => {
  const schema: Schema = {
    files: [],
    provider: null,
    models: [model('User', [field('id')]), model('Post', [field('id'), field('authorId')])],
    enums: [],
    relations: [relation('User', 'Post')],
  }

  it('returns the stored positions untouched when every model has one', () => {
    const stored = { User: { x: 1, y: 2 }, Post: { x: 300, y: 2 } }
    expect(positionsFor(schema, stored)).toStrictEqual(stored)
  })

  it('fills missing models from auto layout and keeps stored ones', () => {
    const computed = autoLayout(schema.models, schema.relations)
    expect(positionsFor(schema, { User: { x: 1, y: 2 } })).toStrictEqual({
      User: { x: 1, y: 2 },
      Post: computed.Post,
    })
  })

  it('drops positions of models that no longer exist', () => {
    expect(
      positionsFor(schema, { User: { x: 1, y: 2 }, Post: { x: 3, y: 4 }, Ghost: { x: 9, y: 9 } }),
    ).toStrictEqual({ User: { x: 1, y: 2 }, Post: { x: 3, y: 4 } })
  })
})
