import { describe, expect, it } from 'vite-plus/test'

import {
  buildEdges,
  buildNodes,
  edgeLabel,
  MODEL_HANDLE,
  sourceHandle,
  targetHandle,
  highlightEdges,
} from './graph.js'

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
}

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Relation = {
  readonly id: string
  readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
  readonly onDelete: string | null
  readonly from: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
  readonly to: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
}

type Schema = { readonly models: readonly Model[]; readonly relations: readonly Relation[] }

function field(name: string, kind: Field['kind'] = 'scalar'): Field {
  return {
    name,
    kind,
    type: 'String',
    isList: false,
    isRequired: true,
    isId: name === 'id',
    isForeignKey: false,
    documentation: null,
  }
}

function model(name: string, fields: Field[]): Model {
  return { name, dbName: null, primaryKey: null, fields }
}

const inferred: Relation = {
  id: 'User.id->Post.authorId',
  origin: 'inferred',
  from: { model: 'User', field: 'id', cardinality: 'one' },
  to: { model: 'Post', field: 'authorId', cardinality: 'many' },
  onDelete: 'SetNull',
}

const manyToMany: Relation = {
  id: 'Post.tags<->Tag.posts',
  origin: 'implicit-many-to-many',
  from: { model: 'Post', field: 'tags', cardinality: 'many' },
  to: { model: 'Tag', field: 'posts', cardinality: 'many' },
  onDelete: null,
}

const annotated: Relation = {
  id: 'User.id->Post.ghost',
  origin: 'annotated',
  from: { model: 'User', field: 'id', cardinality: 'zero-one' },
  to: { model: 'Post', field: 'ghost', cardinality: 'zero-many' },
  onDelete: null,
}

const schema: Schema = {
  models: [
    model('User', [field('id'), field('posts', 'object')]),
    model('Post', [field('id'), field('authorId'), field('tags', 'object')]),
    model('Tag', [field('id')]),
  ],
  relations: [inferred, manyToMany, annotated],
}

describe('buildNodes', () => {
  it('creates one model node per model with stored or zero positions', () => {
    const nodes = buildNodes(schema, { User: { x: 10, y: 20 } })
    expect(nodes.map((n) => [n.id, n.type, n.position])).toStrictEqual([
      ['User', 'model', { x: 10, y: 20 }],
      ['Post', 'model', { x: 0, y: 0 }],
      ['Tag', 'model', { x: 0, y: 0 }],
    ])
    expect(nodes[0]?.data.fields.map((f) => f.name)).toStrictEqual(['id'])
  })
})

describe('buildEdges', () => {
  it('connects field handles for foreign keys and header handles otherwise', () => {
    expect(
      buildEdges(schema).map((e) => [
        e.id,
        e.source,
        e.sourceHandle,
        e.target,
        e.targetHandle,
        e.label,
        e.className,
      ]),
    ).toStrictEqual([
      [
        'User.id->Post.authorId',
        'User',
        sourceHandle('id'),
        'Post',
        targetHandle('authorId'),
        'on delete set null',
        'relation-edge relation-edge--inferred',
      ],
      [
        'Post.tags<->Tag.posts',
        'Post',
        sourceHandle(MODEL_HANDLE),
        'Tag',
        targetHandle(MODEL_HANDLE),
        'many to many',
        'relation-edge relation-edge--implicit-many-to-many',
      ],
      [
        'User.id->Post.ghost',
        'User',
        sourceHandle(MODEL_HANDLE),
        'Post',
        targetHandle(MODEL_HANDLE),
        '@relation',
        'relation-edge relation-edge--annotated',
      ],
    ])
  })

  it('marks both ends with the IE symbol of their cardinality', () => {
    expect(buildEdges(schema).map((e) => [e.markerStart, e.markerEnd])).toStrictEqual([
      ['er-one', 'er-many'],
      ['er-many', 'er-many'],
      ['er-zero-one', 'er-zero-many'],
    ])
  })
})

describe('edgeLabel', () => {
  it('omits the label when no referential action is set', () => {
    expect(edgeLabel({ ...inferred, onDelete: null })).toBeUndefined()
    expect(edgeLabel({ ...inferred, onDelete: 'Cascade' })).toBe('on delete cascade')
  })
})

describe('highlightEdges', () => {
  it('leaves class names untouched when nothing is selected', () => {
    const edges = buildEdges(schema)
    expect(highlightEdges(edges, [])).toStrictEqual(edges)
  })

  it('highlights edges touching a selected model and dims the rest', () => {
    expect(
      highlightEdges(buildEdges(schema), ['Tag']).map((e) => [e.id, e.className]),
    ).toStrictEqual([
      ['User.id->Post.authorId', 'relation-edge relation-edge--inferred is-dimmed'],
      [
        'Post.tags<->Tag.posts',
        'relation-edge relation-edge--implicit-many-to-many is-highlighted',
      ],
      ['User.id->Post.ghost', 'relation-edge relation-edge--annotated is-dimmed'],
    ])
  })
})
