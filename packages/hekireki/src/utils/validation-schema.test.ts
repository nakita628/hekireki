import { describe, expect, it } from 'vite-plus/test'

import { makePropertiesGenerator } from './validation-schema.js'

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
    const zodWithWrap = makePropertiesGenerator('z', (expr, isRequired) =>
      isRequired ? expr : `${expr}.exactOptional()`,
    )
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
