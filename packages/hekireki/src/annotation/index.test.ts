import { describe, expect, it } from 'vite-plus/test'

import {
  docBlockLines,
  extractObjectType,
  isAnnotationLine,
  makeValidationExtractor,
  parseRelation,
  stripAnnotations,
} from './index.js'

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
    expect(result).toBe('pipe(v.string(), v.uuid())')
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

describe('docBlockLines', () => {
  it('is no lines without prose', () => {
    expect(docBlockLines(undefined, '  ')).toStrictEqual([])
  })
  it('indents every line and leaves a blank line bare', () => {
    expect(docBlockLines('First.\n\nSecond.', '  ')).toStrictEqual([
      '  /**',
      '   * First.',
      '   *',
      '   * Second.',
      '   */',
    ])
  })
  it('keeps one line of prose on one line', () => {
    expect(docBlockLines('The key.', '  ')).toStrictEqual(['  /** The key. */'])
  })
  it('cannot be closed early by the prose', () => {
    expect(docBlockLines('a */ b', '')).toStrictEqual(['/** a *\\/ b */'])
  })
})

describe('stripAnnotations', () => {
  it('drops an @api. line as any other annotation', () => {
    expect(stripAnnotations('The bcrypt hash.\n@api.hidden')).toBe('The bcrypt hash.')
  })

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
    expect(extractObjectType('Some description', '@z.')).toBeUndefined()
  })

  it('returns undefined for undefined documentation', () => {
    expect(extractObjectType(undefined, '@z.')).toBeUndefined()
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
    expect(extractObjectType('@v.strictObject', '@z.')).toBeUndefined()
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
