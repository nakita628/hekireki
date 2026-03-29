import { describe, expect, it, vi } from 'vite-plus/test'

import { makeValidationExtractor, parseDocumentWithoutAnnotations } from '../utils/index.js'
import { collectRelationProps, makeRelationsOnly, validationSchemas } from './prisma.js'
import { makeZodInfer, makeZodSchemas, PRISMA_TO_ZOD } from './zod.js'

// ============================================================================
// collectRelationProps
// ============================================================================

describe('collectRelationProps', () => {
  it('should collect relation props from User and Post', () => {
    const result = collectRelationProps([
      {
        name: 'User',
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isList: false },
          { name: 'posts', kind: 'object', type: 'Post', isList: true, isRequired: false },
        ],
      },
      {
        name: 'Post',
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isList: false },
          { name: 'user', kind: 'object', type: 'User', isList: false, isRequired: true },
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
          { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
          { name: 'key', type: 'String', kind: 'scalar', isRequired: true, isList: false },
          { name: 'value', type: 'String', kind: 'scalar', isRequired: true, isList: false },
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
          { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
          { name: 'manager', kind: 'object', type: 'Employee', isList: false, isRequired: false },
          {
            name: 'subordinates',
            kind: 'object',
            type: 'Employee',
            isList: true,
            isRequired: false,
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

// ============================================================================
// makeRelationsOnly
// ============================================================================

describe('makeRelationsOnly', () => {
  it('should call makeRelations for each model and join results', () => {
    const mockMakeRelations = vi.fn(
      (
        model: { readonly name: string },
        relProps: readonly {
          readonly key: string
          readonly targetModel: string
          readonly isMany: boolean
        }[],
        _options: { readonly includeType: boolean },
      ) => {
        if (relProps.length === 0) return null
        return `// relations for ${model.name}`
      },
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
    const mockMakeRelations = vi.fn(() => null)

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
    const mockMakeRelations = vi.fn(
      (
        _model: { readonly name: string },
        relProps: readonly {
          readonly key: string
          readonly targetModel: string
          readonly isMany: boolean
        }[],
        _options: { readonly includeType: boolean },
      ) => {
        capturedRelProps.push(relProps)
        return null
      },
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
        ],
      },
    }

    makeRelationsOnly(dmmf, true, mockMakeRelations)

    expect(capturedRelProps[0]).toStrictEqual([{ key: 'posts', targetModel: 'Post', isMany: true }])
  })
})

// ============================================================================
// validationSchemas
// ============================================================================

describe('validationSchemas', () => {
  it('should generate validation schemas with type mapping', () => {
    const models = [
      {
        name: 'User',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@z.uuid()',
          },
          {
            name: 'name',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@z.string().min(1)',
          },
        ],
      },
    ]

    const result = validationSchemas(models, true, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: parseDocumentWithoutAnnotations,
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  id: z.uuid(),\n  name: z.string().min(1)\n})\n\nexport type User = z.infer<typeof UserSchema>",
    )
  })

  it('should generate schemas without type inference when type is false', () => {
    const models = [
      {
        name: 'Post',
        fields: [
          {
            name: 'title',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@z.string()',
          },
        ],
      },
    ]

    const result = validationSchemas(models, false, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: parseDocumentWithoutAnnotations,
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const PostSchema = z.object({\n  title: z.string()\n})",
    )
  })

  it('should use typeMapping fallback when no annotation is present', () => {
    const models = [
      {
        name: 'Item',
        fields: [{ name: 'count', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
      },
    ]

    const result = validationSchemas(models, false, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: parseDocumentWithoutAnnotations,
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const ItemSchema = z.object({\n  count: z.number()\n})",
    )
  })

  it('should generate schemas with comment true and type false', () => {
    const models = [
      {
        name: 'User',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: 'Primary key\n@z.uuid()',
          },
        ],
      },
    ]

    const result = validationSchemas(models, false, true, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: parseDocumentWithoutAnnotations,
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  /**\n   * Primary key\n   */\n  id: z.uuid()\n})",
    )
  })

  it('should resolve enum fields via formatEnum', () => {
    const models = [
      {
        name: 'User',
        fields: [
          {
            name: 'role',
            type: 'Role',
            kind: 'enum',
            isRequired: true,
            isList: false,
          },
        ],
      },
    ]

    const enums = [{ name: 'Role', values: [{ name: 'ADMIN' }, { name: 'USER' }] }]

    const result = validationSchemas(models, false, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: parseDocumentWithoutAnnotations,
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
      enums,
      formatEnum: (values) => `enum([${values.map((v) => `'${v}'`).join(', ')}])`,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  role: z.enum(['ADMIN', 'USER'])\n})",
    )
  })

  it('should call onWarning for fields with no annotation or typeMapping', () => {
    const warnings: string[] = []
    const models = [
      {
        name: 'User',
        fields: [
          {
            name: 'mystery',
            type: 'CustomType',
            kind: 'scalar',
            isRequired: true,
            isList: false,
          },
        ],
      },
    ]

    validationSchemas(models, false, false, {
      importStatement: '',
      annotationPrefix: '@z.',
      parseDocument: parseDocumentWithoutAnnotations,
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      onWarning: (msg) => warnings.push(msg),
    })

    expect(warnings).toStrictEqual([
      'Warning: Field "User.mystery" has no @z. annotation and will be omitted from the schema',
    ])
  })

  it('should not call onWarning when all fields have annotations', () => {
    const warnings: string[] = []
    const models = [
      {
        name: 'User',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@z.uuid()',
          },
        ],
      },
    ]

    validationSchemas(models, false, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      parseDocument: parseDocumentWithoutAnnotations,
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      onWarning: (msg) => warnings.push(msg),
    })

    expect(warnings).toStrictEqual([])
  })
})
