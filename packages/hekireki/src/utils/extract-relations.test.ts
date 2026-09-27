import { describe, expect, it, vi } from 'vite-plus/test'

import { collectRelationProps, makeRelationsOnly } from './extract-relations.js'

describe('collectRelationProps', () => {
  it('should collect relation props from User and Post', () => {
    const result = collectRelationProps([
      {
        name: 'User',
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isList: false },
          { name: 'posts', kind: 'object', type: 'Post', isList: true },
        ],
      },
      {
        name: 'Post',
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isList: false },
          { name: 'user', kind: 'object', type: 'User', isList: false },
        ],
      },
    ])
    expect(result).toStrictEqual([
      { model: 'User', key: 'posts', targetModel: 'Post', isMany: true },
      { model: 'Post', key: 'user', targetModel: 'User', isMany: false },
    ])
  })

  it('should return empty array for model with no relations', () => {
    const result = collectRelationProps([
      {
        name: 'Setting',
        fields: [
          { name: 'id', type: 'Int', kind: 'scalar', isList: false },
          { name: 'key', type: 'String', kind: 'scalar', isList: false },
          { name: 'value', type: 'String', kind: 'scalar', isList: false },
        ],
      },
    ])
    expect(result).toStrictEqual([])
  })

  it('should handle self-referencing relations', () => {
    const result = collectRelationProps([
      {
        name: 'Employee',
        fields: [
          { name: 'id', type: 'Int', kind: 'scalar', isList: false },
          { name: 'manager', kind: 'object', type: 'Employee', isList: false },
          {
            name: 'subordinates',
            kind: 'object',
            type: 'Employee',
            isList: true,
          },
        ],
      },
    ])
    expect(result).toStrictEqual([
      { model: 'Employee', key: 'manager', targetModel: 'Employee', isMany: false },
      { model: 'Employee', key: 'subordinates', targetModel: 'Employee', isMany: true },
    ])
  })
})

describe('makeRelationsOnly', () => {
  it('should call makeRelations for each model and join results', () => {
    const mockMakeRelations = vi.fn<Parameters<typeof makeRelationsOnly>[2]>((model, relProps) =>
      relProps.length === 0 ? null : `// relations for ${model.name}`,
    )

    const dmmf = {
      datamodel: {
        models: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
              { name: 'posts', kind: 'object', type: 'Post', isList: true, isRequired: false },
            ],
          },
          {
            name: 'Post',
            fields: [
              { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
              { name: 'author', kind: 'object', type: 'User', isList: false, isRequired: true },
            ],
          },
        ],
      },
    }

    const result = makeRelationsOnly(dmmf, true, mockMakeRelations)

    expect(mockMakeRelations).toHaveBeenCalledTimes(2)
    expect(result).toBe('// relations for User\n\n// relations for Post')
  })

  it('should filter out null results from makeRelations', () => {
    const mockMakeRelations = vi.fn<Parameters<typeof makeRelationsOnly>[2]>(() => null)

    const dmmf = {
      datamodel: {
        models: [
          {
            name: 'Setting',
            fields: [{ name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
          },
        ],
      },
    }

    const result = makeRelationsOnly(dmmf, false, mockMakeRelations)
    expect(result).toBe('')
  })

  it('should pass correct relProps to makeRelations', () => {
    const capturedRelProps: unknown[] = []
    const mockMakeRelations = vi.fn<Parameters<typeof makeRelationsOnly>[2]>((_model, relProps) => {
      capturedRelProps.push(relProps)
      return null
    })

    const dmmf = {
      datamodel: {
        models: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
              { name: 'posts', kind: 'object', type: 'Post', isList: true, isRequired: false },
            ],
          },
        ],
      },
    }

    makeRelationsOnly(dmmf, true, mockMakeRelations)

    expect(capturedRelProps[0]).toStrictEqual([{ key: 'posts', targetModel: 'Post', isMany: true }])
  })
})
