import { describe, expect, it } from 'vite-plus/test'

import {
  groupByModel,
  isFields,
  makePropertiesGenerator,
  schemaFromFields,
} from './validation-schema.js'

/** The field names, comma separated. */
function joinedFieldNames(fields: readonly { readonly fieldName: string }[]) {
  return fields.map((f) => f.fieldName).join(', ')
}

/** A Zod field as written: optional with `.exactOptional()` unless it is required. */
function exactOptionalUnlessRequired(expr: string, isRequired: boolean) {
  return isRequired ? expr : `${expr}.exactOptional()`
}

describe('makePropertiesGenerator', () => {
  const zodProperties = makePropertiesGenerator('z')
  const valibotProperties = makePropertiesGenerator('v')

  const zodFields = [
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'id',
      validation: 'uuid()',
      isRequired: true,
    },
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'name',
      validation: 'string().min(1).max(50)',
      isRequired: true,
    },
  ] as const

  const valibotFields = [
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'id',
      validation: 'pipe(v.string(), v.uuid())',
      isRequired: true,
    },
    {
      documentation: '',
      modelName: 'User',
      fieldName: 'name',
      validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
      isRequired: true,
    },
  ] as const
  it.concurrent('zod properties', () => {
    const result = zodProperties(zodFields)
    const expected = `  id: z.uuid(),
  name: z.string().min(1).max(50)`
    expect(result).toBe(expected)
  })
  it.concurrent('valibot properties', () => {
    const result = valibotProperties(valibotFields)
    const expected = `  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))`
    expect(result).toBe(expected)
  })

  it.concurrent('wraps optional fields with wrapCardinality', () => {
    const zodWithWrap = makePropertiesGenerator('z', exactOptionalUnlessRequired)
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'email',
        validation: 'string()',
        isRequired: false,
      },
    ] as const
    const result = zodWithWrap(fields)
    expect(result).toBe('  id: z.uuid(),\n  email: z.string().exactOptional()')
  })

  it.concurrent('skips fields with null validation', () => {
    const gen = makePropertiesGenerator('z')
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'posts',
        validation: null,
        isRequired: true,
      },
    ] as const
    const result = gen(fields)
    expect(result).toBe('  id: z.uuid()')
  })
})

describe('groupByModel', () => {
  it('groups fields by model name', () => {
    const result = groupByModel([
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'name',
        validation: 'string().min(1).max(50)',
        isRequired: true,
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'title',
        validation: 'string().min(1).max(100)',
        isRequired: true,
      },
    ])
    expect(Object.keys(result)).toStrictEqual(['User', 'Post'])
    expect(result['User']).toStrictEqual([
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'name',
        validation: 'string().min(1).max(50)',
        isRequired: true,
      },
    ])
    expect(result['Post']).toStrictEqual([
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'title',
        validation: 'string().min(1).max(100)',
        isRequired: true,
      },
    ])
  })
})

describe('isFields', () => {
  it.concurrent('filters out null validations', () => {
    const result = isFields([
      [
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'id',
          validation: 'uuid()',
          isRequired: true,
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'posts',
          validation: null,
          isRequired: true,
        },
      ],
    ])
    expect(result).toStrictEqual([
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
    ])
  })
})

describe('schemaFromFields', () => {
  it('combines schemaBuilder and propertiesGenerator', () => {
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'name',
        validation: 'string()',
        isRequired: true,
      },
    ]
    const mockSchema = (name: string, f: string) => `schema(${name}, ${f})`
    const result = schemaFromFields(fields, mockSchema, joinedFieldNames)
    expect(result).toBe('schema(User, id, name)')
  })
})
