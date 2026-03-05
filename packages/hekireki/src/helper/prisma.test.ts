import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'
import { describe, expect, it, vi } from 'vitest'
import {
  makeDocumentParser,
  makeValidationExtractor,
  makeZodInfer,
  makeZodSchema,
  makePropertiesGenerator,
} from '../utils/index.js'
import { collectRelationProps, makeRelationsOnly, validationSchemas } from './prisma.js'
import { PRISMA_TO_ZOD, makeZodSchemas } from './zod.js'

// Test run
// pnpm vitest run ./src/helper/prisma.test.ts

// ============================================================================
// Helpers
// ============================================================================

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
    nativeType: null,
    ...overrides,
  }
}

// ============================================================================
// collectRelationProps
// ============================================================================

describe('collectRelationProps', () => {
  it('should collect relation props from User and Post', () => {
    const result = collectRelationProps([
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({
            name: 'posts',
            kind: 'object',
            type: 'Post',
            isList: true,
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({
            name: 'user',
            kind: 'object',
            type: 'User',
            isList: false,
          }),
        ],
      }),
    ])
    expect(result).toStrictEqual([
      { model: 'User', key: 'posts', targetModel: 'Post', isMany: true },
      { model: 'Post', key: 'user', targetModel: 'User', isMany: false },
    ])
  })

  it('should return empty array for model with no relations', () => {
    const result = collectRelationProps([
      makeModel({
        name: 'Setting',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'key', type: 'String' }),
          makeField({ name: 'value', type: 'String' }),
        ],
      }),
    ])
    expect(result).toStrictEqual([])
  })

  it('should handle self-referencing relations', () => {
    const result = collectRelationProps([
      makeModel({
        name: 'Employee',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'manager',
            kind: 'object',
            type: 'Employee',
            isList: false,
          }),
          makeField({
            name: 'subordinates',
            kind: 'object',
            type: 'Employee',
            isList: true,
          }),
        ],
      }),
    ])
    expect(result).toStrictEqual([
      { model: 'Employee', key: 'manager', targetModel: 'Employee', isMany: false },
      { model: 'Employee', key: 'subordinates', targetModel: 'Employee', isMany: true },
    ])
  })
})

// ============================================================================
// makeRelationsOnly
// ============================================================================

describe('makeRelationsOnly', () => {
  it('should call makeRelations for each model and join results', () => {
    const mockMakeRelations = vi.fn(
      (
        model: DMMF.Model,
        relProps: readonly { readonly key: string; readonly targetModel: string; readonly isMany: boolean }[],
        _options: { readonly includeType: boolean },
      ) => {
        if (relProps.length === 0) return null
        return `// relations for ${model.name}`
      },
    )

    const dmmf = {
      datamodel: {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'posts', kind: 'object', type: 'Post', isList: true }),
            ],
          }),
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'author', kind: 'object', type: 'User', isList: false }),
            ],
          }),
        ],
        enums: [],
        types: [],
      },
    } as unknown as GeneratorOptions['dmmf']

    const result = makeRelationsOnly(dmmf, true, mockMakeRelations)

    expect(mockMakeRelations).toHaveBeenCalledTimes(2)
    expect(result).toBe('// relations for User\n\n// relations for Post')
  })

  it('should filter out null results from makeRelations', () => {
    const mockMakeRelations = vi.fn(() => null)

    const dmmf = {
      datamodel: {
        models: [
          makeModel({
            name: 'Setting',
            fields: [makeField({ name: 'id', type: 'Int', isId: true })],
          }),
        ],
        enums: [],
        types: [],
      },
    } as unknown as GeneratorOptions['dmmf']

    const result = makeRelationsOnly(dmmf, false, mockMakeRelations)
    expect(result).toBe('')
  })

  it('should pass correct relProps to makeRelations', () => {
    const capturedRelProps: unknown[] = []
    const mockMakeRelations = vi.fn(
      (
        _model: DMMF.Model,
        relProps: readonly { readonly key: string; readonly targetModel: string; readonly isMany: boolean }[],
        _options: { readonly includeType: boolean },
      ) => {
        capturedRelProps.push(relProps)
        return null
      },
    )

    const dmmf = {
      datamodel: {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'posts', kind: 'object', type: 'Post', isList: true }),
            ],
          }),
        ],
        enums: [],
        types: [],
      },
    } as unknown as GeneratorOptions['dmmf']

    makeRelationsOnly(dmmf, true, mockMakeRelations)

    expect(capturedRelProps[0]).toStrictEqual([
      { key: 'posts', targetModel: 'Post', isMany: true },
    ])
  })
})

// ============================================================================
// validationSchemas
// ============================================================================

describe('validationSchemas', () => {
  it('should generate validation schemas with type mapping', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            documentation: '@z.uuid()',
          }),
          makeField({
            name: 'name',
            type: 'String',
            documentation: '@z.string().min(1)',
          }),
        ],
      }),
    ]

    const result = validationSchemas(models, true, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: makeDocumentParser('@z.'),
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toContain("import * as z from 'zod'")
    expect(result).toContain('export const UserSchema = z.object(')
    expect(result).toContain('id: z.uuid()')
    expect(result).toContain('name: z.string().min(1)')
    expect(result).toContain('export type User = z.infer<typeof UserSchema>')
  })

  it('should generate schemas without type inference when type is false', () => {
    const models = [
      makeModel({
        name: 'Post',
        fields: [
          makeField({
            name: 'title',
            type: 'String',
            documentation: '@z.string()',
          }),
        ],
      }),
    ]

    const result = validationSchemas(models, false, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: makeDocumentParser('@z.'),
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toContain('export const PostSchema = z.object(')
    expect(result).not.toContain('export type Post =')
  })

  it('should use typeMapping fallback when no annotation is present', () => {
    const models = [
      makeModel({
        name: 'Item',
        fields: [
          makeField({ name: 'count', type: 'Int' }),
        ],
      }),
    ]

    const result = validationSchemas(models, false, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: makeDocumentParser('@z.'),
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toContain('count: z.number()')
  })
})
