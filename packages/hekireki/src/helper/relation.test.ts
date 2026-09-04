import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  annotatedERRelations,
  erKey,
  erRelations,
  implicitManyToManyERRelations,
  inferredERRelations,
  mergeERRelations,
} from './relation.js'

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

/** User.id <- Post.userId, with the requiredness of the foreign key under test. */
function oneToMany(fkRequired: boolean) {
  return [
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
        makeField({ name: 'userId', type: 'Int', isRequired: fkRequired }),
        makeField({
          name: 'author',
          type: 'User',
          kind: 'object',
          isRequired: fkRequired,
          relationName: 'PostToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    }),
  ]
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
  // A required foreign key means every child has exactly one parent; a list back relation has no
  // lower bound in Prisma, so the child end stays optional however the key is declared.
  it('maps a required FK with a list inverse to one / zero-many', () => {
    expect(inferredERRelations(oneToMany(true))).toStrictEqual([
      {
        name: 'PostToUser',
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'zero-many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  it('maps an optional FK with a list inverse to zero-one / zero-many', () => {
    expect(inferredERRelations(oneToMany(false))).toStrictEqual([
      {
        name: 'PostToUser',
        from: { model: 'User', field: 'id', cardinality: 'zero-one' },
        to: { model: 'Post', field: 'userId', cardinality: 'zero-many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  it('maps a self-referencing optional FK to zero-one / zero-many', () => {
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
        name: 'CategoryToCategory',
        from: { model: 'Category', field: 'id', cardinality: 'zero-one' },
        to: { model: 'Category', field: 'parentId', cardinality: 'zero-many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  // The back relation of a one-to-one is optional in Prisma: a user may have no profile.
  it('maps an optional non-list inverse to one / zero-one', () => {
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
        name: 'ProfileToUser',
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Profile', field: 'userId', cardinality: 'zero-one' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })

  // Two relations between the same pair: each one must find its own back relation.
  it('pairs every relation with the back relation of the same name', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'pinned',
            type: 'Post',
            kind: 'object',
            isList: false,
            isRequired: false,
            relationName: 'pinned',
          }),
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
          makeField({ name: 'authorId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['authorId'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'pinnedBy',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: false,
            relationName: 'pinned',
          }),
        ],
      }),
    ]
    expect(inferredERRelations(models)).toStrictEqual([
      {
        name: 'PostToUser',
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'authorId', cardinality: 'zero-many' },
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

describe('implicitManyToManyERRelations', () => {
  const postAndTag = (reversed = false) => {
    const models = [
      makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'tags',
            type: 'Tag',
            kind: 'object',
            isList: true,
            relationName: 'PostToTag',
          }),
        ],
      }),
      makeModel({
        name: 'Tag',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToTag',
          }),
        ],
      }),
    ]
    return reversed ? [models[1], models[0]].filter((m) => m !== undefined) : models
  }

  it('emits one relation per join table, both ends zero or many', () => {
    expect(implicitManyToManyERRelations(postAndTag())).toStrictEqual([
      {
        name: 'PostToTag',
        from: { model: 'Post', field: 'tags', cardinality: 'zero-many' },
        to: { model: 'Tag', field: 'posts', cardinality: 'zero-many' },
        identifying: false,
        origin: 'implicit-many-to-many',
      },
    ])
  })

  it('does not emit the same pair twice when the models are declared the other way round', () => {
    expect(implicitManyToManyERRelations(postAndTag(true))).toHaveLength(1)
  })

  it('emits a self many-to-many once', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'friendOf',
            type: 'User',
            kind: 'object',
            isList: true,
            relationName: 'friends',
          }),
          makeField({
            name: 'friends',
            type: 'User',
            kind: 'object',
            isList: true,
            relationName: 'friends',
          }),
        ],
      }),
    ]
    expect(implicitManyToManyERRelations(models)).toStrictEqual([
      {
        name: 'friends',
        from: { model: 'User', field: 'friendOf', cardinality: 'zero-many' },
        to: { model: 'User', field: 'friends', cardinality: 'zero-many' },
        identifying: false,
        origin: 'implicit-many-to-many',
      },
    ])
  })

  it('ignores a list that carries the foreign key of a one-to-many', () => {
    expect(implicitManyToManyERRelations(oneToMany(true))).toStrictEqual([])
  })
})

describe('annotatedERRelations', () => {
  it('parses a one-to-many annotation', () => {
    const models = [
      makeModel({ name: 'Post', documentation: '@relation User.id Post.userId one-to-many' }),
    ]
    expect(annotatedERRelations(models)).toStrictEqual([
      {
        name: null,
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
        name: null,
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'annotated',
      },
      {
        name: null,
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
        name: null,
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
    expect(mergeERRelations(oneToMany(true))).toStrictEqual([
      {
        name: 'PostToUser',
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'zero-many' },
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
        name: null,
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
        identifying: true,
        origin: 'annotated',
      },
    ])
  })

  // C3: FK + same-pair annotation -> annotation overrides cardinality, origin and name stay.
  it('lets an annotation override an inferred FK cardinality while keeping origin inferred', () => {
    const [user, post] = oneToMany(true)
    const models = [
      user,
      makeModel({
        ...post,
        name: 'Post',
        documentation: '@relation User.id Post.userId one-to-one',
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        name: 'PostToUser',
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
        name: null,
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
      ...oneToMany(true),
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
    expect(
      mergeERRelations(models).map((relation) => [erKey(relation), relation.origin]),
    ).toStrictEqual([
      ['User.id->Post.userId', 'inferred'],
      ['Tag.id->Article.tagId', 'annotated'],
    ])
  })

  // C7: invalid / unsupported annotations are ignored; the FK still drives output.
  it('ignores invalid annotations and falls back to the inferred FK', () => {
    const [user, post] = oneToMany(true)
    const models = [
      user,
      makeModel({
        ...post,
        name: 'Post',
        documentation: '@relation one-to-many\n@relation User.id Post.userId one-to-one-optional',
      }),
    ]
    expect(mergeERRelations(models)).toStrictEqual([
      {
        name: 'PostToUser',
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'zero-many' },
        identifying: true,
        origin: 'inferred',
      },
    ])
  })
})

describe('erRelations', () => {
  it('lists the foreign keys, then the implicit many-to-many relations', () => {
    const [user, post] = oneToMany(true)
    const models = [
      makeModel({
        ...post,
        name: 'Post',
        fields: [
          ...(post?.fields ?? []),
          makeField({
            name: 'tags',
            type: 'Tag',
            kind: 'object',
            isList: true,
            relationName: 'PostToTag',
          }),
        ],
      }),
      makeModel({
        name: 'Tag',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToTag',
          }),
        ],
      }),
      ...(user ? [user] : []),
    ]
    expect(erRelations(models).map((relation) => [erKey(relation), relation.origin])).toStrictEqual(
      [
        ['User.id->Post.userId', 'inferred'],
        ['Post.tags->Tag.posts', 'implicit-many-to-many'],
      ],
    )
  })
})
