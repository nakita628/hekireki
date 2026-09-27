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
