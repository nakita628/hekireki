import { describe, expect, it } from 'vitest'

import {
  getBool,
  getString,
  groupByModel,
  isFields,
  makeCommentBlock,
  makePropertiesGenerator,
  makeSnakeCase,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
  stripAnnotations,
} from '.'

describe('utils', () => {
  // ============================================================================
  // Config Utilities
  // ============================================================================

  describe('getString', () => {
    it('returns string when given a string', () => {
      expect(getString('hello')).toBe('hello')
    })
    it('returns first element when given an array', () => {
      expect(getString(['first', 'second'])).toBe('first')
    })
    it('returns fallback when given undefined', () => {
      expect(getString(undefined, 'default')).toBe('default')
    })
    it('returns fallback when array is empty', () => {
      expect(getString([], 'fallback')).toBe('fallback')
    })
    it('returns undefined when no value and no fallback', () => {
      expect(getString(undefined)).toBeUndefined()
    })
  })

  describe('getBool', () => {
    it('returns true for boolean true', () => {
      expect(getBool(true)).toBe(true)
    })
    it('returns true for string "true"', () => {
      expect(getBool('true')).toBe(true)
    })
    it('returns true for array with "true"', () => {
      expect(getBool(['true'])).toBe(true)
    })
    it('returns fallback for undefined', () => {
      expect(getBool(undefined)).toBe(false)
    })
    it('returns custom fallback', () => {
      expect(getBool(undefined, true)).toBe(true)
    })
    it('returns fallback for false', () => {
      expect(getBool(false)).toBe(false)
    })
  })

  // ============================================================================
  // String Utilities
  // ============================================================================

  describe('makeSnakeCase', () => {
    it('converts PascalCase to snake_case', () => {
      expect(makeSnakeCase('TodoTag')).toBe('todo_tag')
      expect(makeSnakeCase('User')).toBe('user')
      expect(makeSnakeCase('Category')).toBe('category')
    })
    it('converts camelCase to snake_case', () => {
      expect(makeSnakeCase('todoTag')).toBe('todo_tag')
      expect(makeSnakeCase('userProfile')).toBe('user_profile')
    })
    it('handles single lowercase word', () => {
      expect(makeSnakeCase('tag')).toBe('tag')
    })
    it('handles empty string', () => {
      expect(makeSnakeCase('')).toBe('')
    })
    it('handles consecutive uppercase (acronyms)', () => {
      expect(makeSnakeCase('HTMLParser')).toBe('htmlparser')
      expect(makeSnakeCase('APIKey')).toBe('apikey')
    })
    it('handles single character', () => {
      expect(makeSnakeCase('A')).toBe('a')
    })
    it('handles already snake_case', () => {
      expect(makeSnakeCase('user_profile')).toBe('user_profile')
    })
  })

  // ============================================================================
  // Annotation Utilities
  // ============================================================================

  describe('makeValidationExtractor', () => {
    it.concurrent('extracts Zod validation', () => {
      const isZod = makeValidationExtractor('@z.')
      const result = isZod(`Unique identifier for the user
  @z.uuid()
  @v.pipe(v.string(), v.uuid())`)
      expect(result).toBe('uuid()')
    })
    it.concurrent('extracts Valibot validation', () => {
      const isValibot = makeValidationExtractor('@v.')
      const result = isValibot(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
      expect(result).toStrictEqual('pipe(v.string(), v.uuid())')
    })
    it.concurrent('extracts TypeBox validation', () => {
      const isTypeBox = makeValidationExtractor('@t.')
      const result = isTypeBox('Primary key\n@t.Type.String()')
      expect(result).toBe('Type.String()')
    })
    it.concurrent('extracts AJV validation', () => {
      const isAjv = makeValidationExtractor('@j.')
      const result = isAjv("@j.{ type: 'string' as const }")
      expect(result).toBe("{ type: 'string' as const }")
    })
    it.concurrent('returns null for undefined documentation', () => {
      const isZod = makeValidationExtractor('@z.')
      expect(isZod(undefined)).toBeNull()
    })
    it.concurrent('returns null when no matching prefix', () => {
      const isZod = makeValidationExtractor('@z.')
      expect(isZod('Just a comment')).toBeNull()
    })
  })

  describe('parseDocumentWithoutAnnotations', () => {
    it('filters out bare @z annotation', () => {
      expect(parseDocumentWithoutAnnotations('User name\n@z')).toStrictEqual(['User name'])
    })
    it('filters out bare @v annotation', () => {
      expect(parseDocumentWithoutAnnotations('User name\n@v')).toStrictEqual(['User name'])
    })
    it('filters out bare @a annotation', () => {
      expect(parseDocumentWithoutAnnotations('User name\n@a')).toStrictEqual(['User name'])
    })
    it('filters out bare @e annotation', () => {
      expect(parseDocumentWithoutAnnotations('User name\n@e')).toStrictEqual(['User name'])
    })
    it('filters both bare and prefixed annotations', () => {
      expect(parseDocumentWithoutAnnotations('User name\n@z\n@v.string()')).toStrictEqual([
        'User name',
      ])
    })
    it('filters out bare @t annotation', () => {
      expect(parseDocumentWithoutAnnotations('Name\n@t')).toStrictEqual(['Name'])
    })
    it('filters out bare @j annotation', () => {
      expect(parseDocumentWithoutAnnotations('Name\n@j')).toStrictEqual(['Name'])
    })
    it('filters out @t. prefixed annotation', () => {
      expect(parseDocumentWithoutAnnotations('Name\n@t.Type.String()')).toStrictEqual(['Name'])
    })
    it('filters out @j. prefixed annotation', () => {
      expect(parseDocumentWithoutAnnotations("Name\n@j.{ type: 'string' as const }")).toStrictEqual(
        ['Name'],
      )
    })
    it('returns empty for undefined', () => {
      expect(parseDocumentWithoutAnnotations(undefined)).toStrictEqual([])
    })
    it('returns empty for only annotations', () => {
      expect(parseDocumentWithoutAnnotations('@z.uuid()\n@v.string()')).toStrictEqual([])
    })
  })

  describe('stripAnnotations', () => {
    it('strips all annotation types', () => {
      expect(
        stripAnnotations(
          'Email address\n@z.email()\n@v.pipe(v.string(), v.email())\n@a."string.email"\n@e.Schema.String',
        ),
      ).toBe('Email address')
    })
    it('returns undefined for only annotations', () => {
      expect(stripAnnotations('@z.cuid()\n@v.pipe(v.string(), v.cuid())')).toBeUndefined()
    })
    it('returns undefined for undefined input', () => {
      expect(stripAnnotations(undefined)).toBeUndefined()
    })
    it('strips bare @z annotation', () => {
      expect(stripAnnotations('Email address\n@z')).toBe('Email address')
    })
    it('strips bare @v annotation', () => {
      expect(stripAnnotations('Email address\n@v')).toBe('Email address')
    })
    it('strips bare @a annotation', () => {
      expect(stripAnnotations('Email address\n@a')).toBe('Email address')
    })
    it('strips bare @e annotation', () => {
      expect(stripAnnotations('Email address\n@e')).toBe('Email address')
    })
    it('strips mixed bare and prefixed annotations', () => {
      expect(stripAnnotations('Email\n@z\n@v.string()\n@a\n@e.Schema.String')).toBe('Email')
    })
    it('returns undefined for bare annotation only', () => {
      expect(stripAnnotations('@z')).toBeUndefined()
    })
    it('strips bare @t annotation', () => {
      expect(stripAnnotations('Primary key\n@t')).toBe('Primary key')
    })
    it('strips bare @j annotation', () => {
      expect(stripAnnotations('Primary key\n@j')).toBe('Primary key')
    })
    it('strips @t. prefixed annotation', () => {
      expect(stripAnnotations('Primary key\n@t.Type.String()')).toBe('Primary key')
    })
    it('strips @j. prefixed annotation', () => {
      expect(stripAnnotations("Primary key\n@j.{ type: 'string' as const }")).toBe('Primary key')
    })
    it('strips @relation annotation', () => {
      expect(stripAnnotations('@relation User.id Post.userId one-to-many')).toBeUndefined()
    })
  })

  // ============================================================================
  // JSDoc Comment Block
  // ============================================================================

  describe('makeCommentBlock', () => {
    it('generates multi-line JSDoc with 2-space indent', () => {
      expect(makeCommentBlock(['Primary key'], 2)).toBe('  /**\n   * Primary key\n   */\n')
    })

    it('generates multi-line JSDoc with 4-space indent for AJV', () => {
      expect(makeCommentBlock(['Primary key'], 4)).toBe('    /**\n     * Primary key\n     */\n')
    })

    it('handles multiple comment lines', () => {
      expect(makeCommentBlock(['Line 1', 'Line 2'], 2)).toBe(
        '  /**\n   * Line 1\n   * Line 2\n   */\n',
      )
    })

    it('returns empty string for empty lines', () => {
      expect(makeCommentBlock([], 2)).toBe('')
    })

    it('generates consistent format across all indentation levels', () => {
      const lines = ['User ID']
      const indent2 = makeCommentBlock(lines, 2)
      const indent4 = makeCommentBlock(lines, 4)
      expect(indent2).toContain('/**')
      expect(indent2).toContain(' * User ID')
      expect(indent2).toContain(' */')
      expect(indent4).toContain('/**')
      expect(indent4).toContain(' * User ID')
      expect(indent4).toContain(' */')
    })
  })

  // ============================================================================
  // Properties Generator
  // ============================================================================

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

  // ============================================================================
  // Schema Utilities
  // ============================================================================

  describe('groupByModel', () => {
    it('groups fields by model name', () => {
      const result = groupByModel([
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
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'id',
          comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
          validation: 'uuid()',
          isRequired: true,
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'title',
          comment: ['Article title', '@v.pipe(v.string(), v.minLength(1), v.maxLength(100))'],
          validation: 'string().min(1).max(100)',
          isRequired: true,
        },
      ])
      expect(Object.keys(result)).toStrictEqual(['User', 'Post'])
      expect(result.User).toStrictEqual([
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
      ])
      expect(result.Post).toStrictEqual([
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'id',
          comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
          validation: 'uuid()',
          isRequired: true,
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'title',
          comment: ['Article title', '@v.pipe(v.string(), v.minLength(1), v.maxLength(100))'],
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
            comment: ['Primary key'],
            validation: 'uuid()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'posts',
            comment: ['One-to-many'],
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
          comment: ['Primary key'],
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
          comment: ['Primary key'],
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'name',
          validation: 'string()',
          isRequired: true,
          comment: ['Name'],
        },
      ]
      const mockSchema = (name: string, f: string) => `schema(${name}, ${f})`
      const mockProps = (_fields: readonly { readonly fieldName: string }[], _comment: boolean) =>
        _fields.map((f) => f.fieldName).join(', ')

      const result = schemaFromFields(fields, true, mockSchema, mockProps as any)
      expect(result).toBe('schema(User, id, name)')
    })
    it('passes comment flag to propertiesGenerator', () => {
      const fields = [
        {
          documentation: '',
          modelName: 'Post',
          fieldName: 'title',
          validation: 'string()',
          isRequired: true,
          comment: [],
        },
      ]
      let receivedComment = false
      const mockSchema = (_name: string, f: string) => f
      const mockProps = (_fields: readonly { readonly fieldName: string }[], comment: boolean) => {
        receivedComment = comment
        return 'props'
      }

      schemaFromFields(fields, false, mockSchema, mockProps as any)
      expect(receivedComment).toBe(false)
    })
  })
})

// ============================================================================
// extractObjectType
// ============================================================================

import { extractObjectType } from './index.js'

describe('extractObjectType', () => {
  it('returns strict for @z.strictObject', () => {
    expect(extractObjectType('@z.strictObject', '@z.')).toBe('strict')
  })

  it('returns loose for @z.looseObject', () => {
    expect(extractObjectType('@z.looseObject', '@z.')).toBe('loose')
  })

  it('returns undefined for no annotation', () => {
    expect(extractObjectType('Some description', '@z.')).toBe(undefined)
  })

  it('returns undefined for undefined documentation', () => {
    expect(extractObjectType(undefined, '@z.')).toBe(undefined)
  })

  it('returns strict for @v.strictObject', () => {
    expect(extractObjectType('@v.strictObject', '@v.')).toBe('strict')
  })

  it('returns loose for @v.looseObject', () => {
    expect(extractObjectType('@v.looseObject', '@v.')).toBe('loose')
  })

  it('returns strict for @a.strictObject', () => {
    expect(extractObjectType('@a.strictObject', '@a.')).toBe('strict')
  })

  it('returns strict for @t.strictObject', () => {
    expect(extractObjectType('@t.strictObject', '@t.')).toBe('strict')
  })

  it('returns strict from multiline documentation', () => {
    expect(extractObjectType('User model\n@z.strictObject\nSome note', '@z.')).toBe('strict')
  })

  it('ignores other prefixes', () => {
    expect(extractObjectType('@v.strictObject', '@z.')).toBe(undefined)
  })
})
