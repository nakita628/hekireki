import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { annotatedERRelations, erKey, inferredERRelations, mergeERRelations } from './relation.js'

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

describe('erKey', () => {
  it('builds a stable key from the from/to pair', () => {
    expect(
      erKey({
        from: { model: 'User', field: 'id' },
        to: { model: 'Post', field: 'userId' },
      }),
    ).toBe('User.id->Post.userId')
  })
})

describe('inferredERRelations', () => {
  it('maps a required FK with a list inverse to one / many', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToUser',
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ]
    expect(inferredERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  it('maps an optional FK with a list inverse to one / zero-many', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToUser',
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            isRequired: false,
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ]
    expect(inferredERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'zero-many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  it('maps a self-referencing optional FK to one / zero-many', () => {
    const categoryModel = makeModel({
      name: 'Category',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'parentId', type: 'Int', isRequired: false }),
        makeField({
          name: 'parent',
          type: 'Category',
          kind: 'object',
          isRequired: false,
          relationName: 'CategoryToCategory',
          relationFromFields: ['parentId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'children',
          type: 'Category',
          kind: 'object',
          isList: true,
          relationName: 'CategoryToCategory',
        }),
      ],
    })
    expect(inferredERRelations([categoryModel])).toStrictEqual([
      {
        from: { model: 'Category', field: 'id', cardinality: 'one' },
        to: { model: 'Category', field: 'parentId', cardinality: 'zero-many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  it('maps a non-list inverse to one / one', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'profile',
            type: 'Profile',
            kind: 'object',
            isList: false,
            isRequired: false,
            relationName: 'ProfileToUser',
          }),
        ],
      }),
      makeModel({
        name: 'Profile',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int', isUnique: true }),
          makeField({
            name: 'user',
            type: 'User',
            kind: 'object',
            relationName: 'ProfileToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ]
    expect(inferredERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Profile', field: 'userId', cardinality: 'one' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  it('returns empty for models with no relations', () => {
    const models = [
      makeModel({
        name: 'Setting',
        fields: [makeField({ name: 'id', type: 'Int', isId: true })],
      }),
    ]
    expect(inferredERRelations(models)).toStrictEqual([])
  })
})

describe('annotatedERRelations', () => {
  it('parses a one-to-many annotation', () => {
    const models = [
      makeModel({ name: 'Post', documentation: '@relation User.id Post.userId one-to-many' }),
    ]
    expect(annotatedERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'annotated',
      },
    ])
  })

  it('parses multiple annotations in one documentation block', () => {
    const models = [
      makeModel({
        name: 'User',
        documentation:
          '@relation User.id Post.userId one-to-many\n@relation User.id Profile.userId one-to-one',
      }),
    ]
    expect(annotatedERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'annotated',
      },
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Profile', field: 'userId', cardinality: 'one' },
        identifying: true,
        origin: 'annotated',
      },
    ])
  })

  it('skips non-annotation lines', () => {
    const models = [
      makeModel({
        name: 'Post',
        documentation: 'Some comment\n@relation User.id Post.userId one-to-many',
      }),
    ]
    expect(annotatedERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'annotated',
      },
    ])
  })

  it('ignores the short-form annotation (cardinality only)', () => {
    const models = [makeModel({ name: 'Post', documentation: '@relation one-to-many' })]
    expect(annotatedERRelations(models)).toStrictEqual([])
  })

  it('ignores the -optional suffix form (not supported)', () => {
    const models = [
      makeModel({
        name: 'Post',
        documentation: '@relation User.id Post.userId one-to-one-optional',
      }),
    ]
    expect(annotatedERRelations(models)).toStrictEqual([])
  })

  it('ignores compound cardinalities with hyphens (zero-one / zero-many)', () => {
    const models = [
      makeModel({ name: 'Post', documentation: '@relation User.id Post.userId zero-one-to-many' }),
    ]
    expect(annotatedERRelations(models)).toStrictEqual([])
  })

  it('returns empty when there is no documentation', () => {
    expect(annotatedERRelations([makeModel({ name: 'User' })])).toStrictEqual([])
  })
})

describe('mergeERRelations', () => {
  // C1: FK only / no annotation -> origin inferred, DMMF-derived cardinality (regression).
  it('keeps an inferred FK relation when there is no annotation', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToUser',
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  // C2: annotation only / no FK -> the relation appears, origin annotated.
  it('emits an annotation-only relation that has no physical FK', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [makeField({ name: 'id', type: 'Int', isId: true })],
      }),
      makeModel({
        name: 'Post',
        documentation: '@relation User.id Post.userId one-to-many',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
        ],
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'annotated',
      },
    ])
  })

  // C3: FK + same-pair annotation -> annotation overrides cardinality, origin stays inferred.
  it('lets an annotation override an inferred FK cardinality while keeping origin inferred', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToUser',
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        documentation: '@relation User.id Post.userId one-to-one',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'one' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  // C4: same annotation pair declared twice -> last-wins.
  it('keeps the last annotation when the same pair is declared twice', () => {
    const models = [
      makeModel({
        name: 'Post',
        documentation:
          '@relation User.id Post.userId one-to-many\n@relation User.id Post.userId one-to-one',
        fields: [makeField({ name: 'id', type: 'Int', isId: true })],
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'one' },
        identifying: true,
        origin: 'annotated',
      },
    ])
  })

  // C5: inferred relations come first in source order, annotation-only pairs append last.
  it('orders inferred relations first and annotation-only relations last', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToUser',
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
      makeModel({ name: 'Tag', fields: [makeField({ name: 'id', type: 'Int', isId: true })] }),
      makeModel({
        name: 'Article',
        documentation: '@relation Tag.id Article.tagId one-to-many',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'tagId', type: 'Int' }),
        ],
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'inferred',
      },
      {
        from: { model: 'Tag', field: 'id', cardinality: 'one' },
        to: { model: 'Article', field: 'tagId', cardinality: 'many' },
        identifying: true,
        origin: 'annotated',
      },
    ])
  })

  // C7: invalid / unsupported annotations are ignored; the FK still drives output.
  it('ignores invalid annotations and falls back to the inferred FK', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToUser',
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        documentation: '@relation one-to-many\n@relation User.id Post.userId one-to-one-optional',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })
})
