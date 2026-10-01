import { describe, expect, it } from 'vite-plus/test'

import {
  chunks,
  isSameList,
  extractObjectType,
  getBool,
  getString,
  getStrings,
  groupByModel,
  isFields,
  lowerFirst,
  makeSnakeCase,
  makeValidationExtractor,
  parseRelation,
  schemaFromFields,
  stripAnnotations,
  isAnnotationLine,
  isLoopbackHostname,
} from './index.js'

describe('utils', () => {
  describe('getString', () => {
    it('returns string when given a string', () => {
      expect(getString('hello')).toBe('hello')
    })
    it('returns first element when given an array', () => {
      expect(getString(['first', 'second'])).toBe('first')
    })
    it('returns undefined when given undefined', () => {
      expect(getString(undefined)).toBeUndefined()
    })
    it('returns undefined when the array is empty', () => {
      expect(getString([])).toBeUndefined()
    })
  })

  describe('getStrings', () => {
    it('wraps a lone string in a list', () => {
      expect(getStrings('er.md')).toStrictEqual(['er.md'])
    })
    it('returns the list it was given, empty or not', () => {
      expect(getStrings(['er.md', 'er.svg'])).toStrictEqual(['er.md', 'er.svg'])
      expect(getStrings([])).toStrictEqual([])
    })
    it('returns undefined when there is no value', () => {
      expect(getStrings(undefined)).toBeUndefined()
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

  describe('stripAnnotations', () => {
    it('drops an @ar. line as any other annotation', () => {
      expect(
        stripAnnotations('The title.\n@ar.length(maximum: 140, message: { ja: "x" })\nMore.'),
      ).toBe('The title.\nMore.')
    })

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
      expect(result.User).toStrictEqual([
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
      expect(result.Post).toStrictEqual([
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
      const mockProps = (_fields: readonly { readonly fieldName: string }[]) =>
        _fields.map((f) => f.fieldName).join(', ')

      const result = schemaFromFields(fields, mockSchema, mockProps)
      expect(result).toBe('schema(User, id, name)')
    })
  })
})

describe('parseRelation', () => {
  it('parses a full @relation annotation', () => {
    expect(parseRelation('@relation User.id Profile.user_id one-to-one')).toStrictEqual({
      fromModel: 'User',
      fromField: 'id',
      toModel: 'Profile',
      toField: 'user_id',
      type: 'one-to-one',
    })
  })

  it('parses a one-to-many annotation', () => {
    expect(parseRelation('@relation Team.id TeamMember.team_id one-to-many')).toStrictEqual({
      fromModel: 'Team',
      fromField: 'id',
      toModel: 'TeamMember',
      toField: 'team_id',
      type: 'one-to-many',
    })
  })

  it('returns null for the short-form (cardinality only)', () => {
    expect(parseRelation('@relation one-to-many')).toBeNull()
  })

  it('returns null for the -optional suffix form', () => {
    expect(parseRelation('@relation User.id Settings.user_id one-to-one-optional')).toBeNull()
  })

  it('returns null for a non-annotation line', () => {
    expect(parseRelation('Some comment')).toBeNull()
  })
})

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

describe('isAnnotationLine', () => {
  it('recognises validator annotations, bare prefixes and @relation lines', () => {
    expect(isAnnotationLine('@z.uuid()')).toBe(true)
    expect(isAnnotationLine("  @p.ConfigDict(extra='forbid')")).toBe(true)
    expect(isAnnotationLine('@z')).toBe(true)
    expect(isAnnotationLine('@relation User.id Post.authorId one-to-many')).toBe(true)
  })

  it('treats everything else as prose', () => {
    expect(isAnnotationLine('@@map + @map column names')).toBe(false)
    expect(isAnnotationLine('@x.foo')).toBe(false)
    expect(isAnnotationLine('@deprecated since v2')).toBe(false)
    expect(isAnnotationLine('Primary key')).toBe(false)
  })
})

describe('isLoopbackHostname', () => {
  it('accepts localhost, its subdomains and loopback addresses', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('LOCALHOST')).toBe(true)
    expect(isLoopbackHostname('app.localhost')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
    expect(isLoopbackHostname('::1')).toBe(true)
  })

  it('rejects every other host', () => {
    expect(isLoopbackHostname('evil.example')).toBe(false)
    expect(isLoopbackHostname('192.168.1.20')).toBe(false)
    expect(isLoopbackHostname('localhost.example')).toBe(false)
    expect(isLoopbackHostname('')).toBe(false)
  })
})

// `User` → `user`: the property Prisma Client exposes a model under, and the label of a type.
describe('lowerFirst', () => {
  it.each([
    ['User', 'user'],
    ['OrderItem', 'orderItem'],
    ['URLThing', 'uRLThing'],
    ['A', 'a'],
    ['user', 'user'],
    ['order_line_item', 'order_line_item'],
    ['_Private', '_Private'],
    ['', ''],
  ])('%s → %s', (text, lowered) => {
    expect(lowerFirst(text)).toBe(lowered)
  })
})

describe('isSameList', () => {
  it.each([
    [['a', 'b'], ['a', 'b'], true],
    [['a', 'b'], ['b', 'a'], false],
    [['a'], ['a', 'b'], false],
    [[], [], true],
  ])('%j and %j: %s', (left, right, expected) => {
    expect(isSameList(left, right)).toBe(expected)
  })
})

describe('chunks', () => {
  it('cuts the items into runs of at most the size, in order', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toStrictEqual([[1, 2], [3, 4], [5]])
    expect(chunks([1, 2], 5)).toStrictEqual([[1, 2]])
    expect(chunks([], 3)).toStrictEqual([])
  })
})
