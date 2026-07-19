import { describe, expect, it } from 'vite-plus/test'

import { makeValidationExtractor, parseDocumentWithoutAnnotations } from '../utils/index.js'
import { makePropertiesGenerator, validationSchemas } from './validation-schema.js'
import { makeZodInfer, makeZodSchemas, PRISMA_TO_ZOD } from './zod.js'

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
describe('makePropertiesGenerator', () => {
  const zodProperties = makePropertiesGenerator('z')
  const valibotProperties = makePropertiesGenerator('v')

  const zodFields = [
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'id',
      comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
      validation: 'uuid()',
      isRequired: true,
    },
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'name',
      comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
      validation: 'string().min(1).max(50)',
      isRequired: true,
    },
  ] as const

  const valibotFields = [
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'id',
      comment: ['Primary key', '@z.uuid()'],
      validation: 'pipe(v.string(), v.uuid())',
      isRequired: true,
    },
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'name',
      comment: ['Display name', '@z.string().min(1).max(50)'],
      validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
      isRequired: true,
    },
  ] as const

  it.concurrent('zod properties comment true', () => {
    const result = zodProperties(zodFields, true)
    const expected = `  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50)`
    expect(result).toBe(expected)
  })
  it.concurrent('zod properties comment false', () => {
    const result = zodProperties(zodFields, false)
    const expected = `  id: z.uuid(),
  name: z.string().min(1).max(50)`
    expect(result).toBe(expected)
  })
  it.concurrent('valibot properties comment true', () => {
    const result = valibotProperties(valibotFields, true)
    const expected = `  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))`
    expect(result).toBe(expected)
  })
  it.concurrent('valibot properties comment false', () => {
    const result = valibotProperties(valibotFields, false)
    const expected = `  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))`
    expect(result).toBe(expected)
  })

  it.concurrent('wraps optional fields with wrapCardinality', () => {
    const zodWithWrap = makePropertiesGenerator('z', (expr, isRequired) =>
      isRequired ? expr : `${expr}.exactOptional()`,
    )
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        comment: [] as string[],
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'email',
        comment: [] as string[],
        validation: 'string()',
        isRequired: false,
      },
    ] as const
    const result = zodWithWrap(fields, false)
    expect(result).toBe('  id: z.uuid(),\n  email: z.string().exactOptional()')
  })

  it.concurrent('skips fields with null validation', () => {
    const gen = makePropertiesGenerator('z')
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        comment: [] as string[],
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'posts',
        comment: [] as string[],
        validation: null,
        isRequired: true,
      },
    ] as const
    const result = gen(fields, false)
    expect(result).toBe('  id: z.uuid()')
  })
})
