import { describe, expect, it } from 'vitest'
import {
  combineKeys,
  ectoTypeToTypespec,
  escapeNote,
  excludeManyToOneRelations,
  findMissingAnnotations,
  formatConstraints,
  getBool,
  getString,
  groupByModel,
  hasBareAnnotation,
  isFields,
  isRelationshipType,
  makeAnnotationExtractor,
  makeArktypeEnumExpression,
  makeArktypeInfer,
  makeArktypeProperties,
  makeArktypeSchema,
  makeCapitalized,
  makeDocumentParser,
  makeEffectEnumExpression,
  makeEffectInfer,
  makeEffectProperties,
  makeEffectSchema,
  makeEnum,
  makeJsDoc,
  makePropertiesGenerator,
  makeRefName,
  makeSnakeCase,
  makeValibotCardinality,
  makeValibotEnumExpression,
  makeValibotInfer,
  makeValibotObject,
  makeValibotSchema,
  makeValidationExtractor,
  makeZodCardinality,
  makeZodEnumExpression,
  makeZodInfer,
  makeZodObject,
  makeZodSchema,
  parseDocumentWithoutAnnotations,
  parseRelation,
  prismaTypeToEctoType,
  removeDuplicateRelations,
  schemaFromFields,
  stripAnnotations,
} from '.'

// Test run
// pnpm vitest run ./src/utils/index.test.ts

describe('utils', () => {
  // ============================================================================
  // String Utilities
  // ============================================================================

  describe('makeCapitalized', () => {
    it.concurrent(`makeCapitalized('test') -> 'Test'`, () => {
      expect(makeCapitalized('test')).toBe('Test')
    })
    it.concurrent(`makeCapitalized('Test') -> 'Test'`, () => {
      expect(makeCapitalized('Test')).toBe('Test')
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
  })

  // ============================================================================
  // Annotation Utilities
  // ============================================================================

  describe('makeDocumentParser', () => {
    it.concurrent('filters out Zod annotation lines', () => {
      const isZodDocument = makeDocumentParser('@z.')
      const result = isZodDocument(`Unique identifier for the user
      @z.uuid()
      @v.pipe(v.string(), v.uuid())`)
      expect(result).toStrictEqual([
        'Unique identifier for the user',
        '@v.pipe(v.string(), v.uuid())',
      ])
    })
    it.concurrent('filters out Valibot annotation lines', () => {
      const isValibotDocument = makeDocumentParser('@v.')
      const result = isValibotDocument(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
      expect(result).toStrictEqual(['Unique identifier for the user', '@z.uuid()'])
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
  })

  // ============================================================================
  // Zod Helpers
  // ============================================================================

  describe('makeZodInfer', () => {
    it.concurrent('generates Zod infer type', () => {
      expect(makeZodInfer('User')).toBe('export type User = z.infer<typeof UserSchema>')
    })
  })

  describe('makeZodSchema', () => {
    it.concurrent('generates schema with comments', () => {
      const result = makeZodSchema(
        'Post',
        `  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  /**
   * Body content (no length limit)
   */
  content: z.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: z.uuid()`,
      )
      const expected = `export const PostSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  /**
   * Body content (no length limit)
   */
  content: z.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: z.uuid()
})`
      expect(result).toBe(expected)
    })
    it.concurrent('generates schema without comments', () => {
      const result = makeZodSchema(
        'Post',
        `  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid()`,
      )
      const expected = `export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid()
})`
      expect(result).toBe(expected)
    })
  })

  // ============================================================================
  // Valibot Helpers
  // ============================================================================

  describe('makeValibotInfer', () => {
    it.concurrent('generates Valibot infer type', () => {
      expect(makeValibotInfer('User')).toBe('export type User = v.InferInput<typeof UserSchema>')
    })
  })

  describe('makeValibotSchema', () => {
    it('generates schema with comments', () => {
      const result = makeValibotSchema(
        'User',
        `  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50),`,
      )
      const expected = `export const UserSchema = v.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50),
})`
      expect(result).toBe(expected)
    })
    it('generates schema without comments', () => {
      const result = makeValibotSchema(
        'User',
        `  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))`,
      )
      const expected = `export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
      expect(result).toBe(expected)
    })
  })

  // ============================================================================
  // Mermaid ER Utilities
  // ============================================================================

  describe('excludeManyToOneRelations', () => {
    it.concurrent('removes duplicates and keeps non-many-to-one', () => {
      const result = excludeManyToOneRelations([
        '    User ||--|| Profile : "(id) <- (user_id)"',
        '    Team }o--|| User : "(team_id) <- (id)"',
        '    Team ||--o{ Member : "(id) <- (team_id)"',
        '    Team ||--o{ Member : "(id) <- (team_id)"',
      ])
      expect(result).toStrictEqual([
        '    User ||--|| Profile : "(id) <- (user_id)"',
        '    Team }o--|| User : "(team_id) <- (id)"',
        '    Team ||--o{ Member : "(id) <- (team_id)"',
      ])
    })
    it.concurrent('deduplicates', () => {
      const result = excludeManyToOneRelations([
        '    Post }o--|| User : "(authorId) <- (id)"',
        '    Post }o--|| User : "(authorId) <- (id)"',
      ])
      expect(result).toStrictEqual(['    Post }o--|| User : "(authorId) <- (id)"'])
    })
    it.concurrent('handles empty', () => {
      expect(excludeManyToOneRelations([])).toStrictEqual([])
    })
  })

  describe('isRelationshipType', () => {
    it.concurrent('returns true for zero-one', () => {
      expect(isRelationshipType('zero-one')).toBe(true)
    })
    it.concurrent('returns true for one', () => {
      expect(isRelationshipType('one')).toBe(true)
    })
    it.concurrent('returns true for zero-many', () => {
      expect(isRelationshipType('zero-many')).toBe(true)
    })
    it.concurrent('returns true for many', () => {
      expect(isRelationshipType('many')).toBe(true)
    })
    it.concurrent('returns false for invalid', () => {
      expect(isRelationshipType('invalid-key')).toBe(false)
    })
  })

  describe('parseRelation', () => {
    it.concurrent('one-to-one', () => {
      expect(parseRelation('@relation User.id Profile.user_id one-to-one')).toStrictEqual({
        fromModel: 'User',
        toModel: 'Profile',
        fromField: 'id',
        toField: 'user_id',
        type: 'one-to-one',
      })
    })
    it.concurrent('one-to-many', () => {
      expect(parseRelation('@relation Team.id TeamMember.team_id one-to-many')).toStrictEqual({
        fromModel: 'Team',
        toModel: 'TeamMember',
        fromField: 'id',
        toField: 'team_id',
        type: 'one-to-many',
      })
    })
    it.concurrent('many-to-one', () => {
      expect(parseRelation('@relation User.id User.parent_id many-to-one')).toStrictEqual({
        fromModel: 'User',
        toModel: 'User',
        fromField: 'id',
        toField: 'parent_id',
        type: 'many-to-one',
      })
    })
    it.concurrent('zero-to-many', () => {
      expect(
        parseRelation('@relation ProjectTeam.project_id TeamMember.team_member_id zero-to-many'),
      ).toStrictEqual({
        fromModel: 'ProjectTeam',
        toModel: 'TeamMember',
        fromField: 'project_id',
        toField: 'team_member_id',
        type: 'zero-to-many',
      })
    })
    it.concurrent('returns null for optional suffix', () => {
      expect(parseRelation('@relation User.id Settings.user_id one-to-one-optional')).toStrictEqual(
        null,
      )
    })
  })

  describe('removeDuplicateRelations', () => {
    it.concurrent('removes duplicates', () => {
      expect(
        removeDuplicateRelations([
          '    Post }o--|| User : "PK(authorId) <- FK(id)"',
          '    Post }o--|| User : "PK(authorId) <- FK(id)"',
        ]),
      ).toStrictEqual(['    Post }o--|| User : "PK(authorId) <- FK(id)"'])
    })
    it.concurrent('keeps unique relations', () => {
      const input = [
        '    User ||--o{ Post : "(id) - (userId)"',
        '    User ||--o{ Comment : "(id) - (userId)"',
        '    User ||--o{ Notification : "(id) - (userId)"',
        '    User ||--o{ Follow : "(id) - (followerId)"',
        '    User ||--o{ Follow : "(id) - (followingId)"',
        '    User ||--o{ Like : "(id) - (userId)"',
      ]
      expect(removeDuplicateRelations(input)).toStrictEqual(input)
    })
    it.concurrent('handles empty', () => {
      expect(removeDuplicateRelations([])).toStrictEqual([])
    })
  })

  // ============================================================================
  // DBML Utilities
  // ============================================================================

  describe('escapeNote', () => {
    it('escapes single quotes', () => {
      expect(escapeNote("User's bio")).toBe("User\\'s bio")
    })
  })

  describe('formatConstraints', () => {
    it('formats non-empty', () => {
      expect(formatConstraints(['pk', 'not null'])).toBe(' [pk, not null]')
    })
    it('returns empty for empty', () => {
      expect(formatConstraints([])).toBe('')
    })
  })

  describe('makeEnum', () => {
    it('generates enum', () => {
      expect(makeEnum({ name: 'Role', values: ['USER', 'ADMIN'] })).toBe(
        'Enum Role {\n  USER\n  ADMIN\n}',
      )
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
  })

  // ============================================================================
  // Ecto Utilities
  // ============================================================================

  describe('prismaTypeToEctoType', () => {
    it('converts Int to integer', () => {
      expect(prismaTypeToEctoType('Int')).toBe('integer')
    })
    it('converts String to string', () => {
      expect(prismaTypeToEctoType('String')).toBe('string')
    })
    it('converts Boolean to boolean', () => {
      expect(prismaTypeToEctoType('Boolean')).toBe('boolean')
    })
    it('converts DateTime to utc_datetime', () => {
      expect(prismaTypeToEctoType('DateTime')).toBe('utc_datetime')
    })
    it('maps Float to float', () => {
      expect(prismaTypeToEctoType('Float')).toBe('float')
    })
    it('maps BigInt to integer', () => {
      expect(prismaTypeToEctoType('BigInt')).toBe('integer')
    })
    it('maps Decimal to decimal', () => {
      expect(prismaTypeToEctoType('Decimal')).toBe('decimal')
    })
    it('maps Json to map', () => {
      expect(prismaTypeToEctoType('Json')).toBe('map')
    })
    it('maps Bytes to binary', () => {
      expect(prismaTypeToEctoType('Bytes')).toBe('binary')
    })
    it('returns string for unsupported types', () => {
      expect(prismaTypeToEctoType('Unknown')).toBe('string')
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
      expect(result.User).toHaveLength(2)
      expect(result.Post).toHaveLength(2)
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
      expect(result).toHaveLength(1)
      expect(result[0].fieldName).toBe('id')
    })
  })

  // ============================================================================
  // Annotation Detection
  // ============================================================================

  describe('hasBareAnnotation', () => {
    it('detects bare @z annotation', () => {
      expect(hasBareAnnotation('@z', '@z')).toBe(true)
    })
    it('detects bare @v annotation in multiline', () => {
      expect(hasBareAnnotation('User name\n@v', '@v')).toBe(true)
    })
    it('does not match @z. prefix as bare', () => {
      expect(hasBareAnnotation('@z.string()', '@z')).toBe(false)
    })
    it('returns false for undefined', () => {
      expect(hasBareAnnotation(undefined, '@z')).toBe(false)
    })
    it('returns false for empty string', () => {
      expect(hasBareAnnotation('', '@z')).toBe(false)
    })
    it('returns false when no bare annotation present', () => {
      expect(hasBareAnnotation('just a comment', '@z')).toBe(false)
    })
    it('detects bare @a annotation', () => {
      expect(hasBareAnnotation('@a', '@a')).toBe(true)
    })
    it('detects bare @e annotation', () => {
      expect(hasBareAnnotation('@e', '@e')).toBe(true)
    })
  })

  describe('parseDocumentWithoutAnnotations (bare)', () => {
    it('filters out bare @z annotation', () => {
      const result = parseDocumentWithoutAnnotations('User name\n@z')
      expect(result).toStrictEqual(['User name'])
    })
    it('filters out bare @v annotation', () => {
      const result = parseDocumentWithoutAnnotations('User name\n@v')
      expect(result).toStrictEqual(['User name'])
    })
    it('filters out bare @a annotation', () => {
      const result = parseDocumentWithoutAnnotations('User name\n@a')
      expect(result).toStrictEqual(['User name'])
    })
    it('filters out bare @e annotation', () => {
      const result = parseDocumentWithoutAnnotations('User name\n@e')
      expect(result).toStrictEqual(['User name'])
    })
    it('filters both bare and prefixed annotations', () => {
      const result = parseDocumentWithoutAnnotations('User name\n@z\n@v.string()')
      expect(result).toStrictEqual(['User name'])
    })
  })

  describe('stripAnnotations (bare)', () => {
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
  })

  describe('enum formatters', () => {
    const values = ['USER', 'ADMIN', 'MODERATOR']

    it('makeZodEnumExpression generates z.enum()', () => {
      expect(makeZodEnumExpression(values)).toBe("enum(['USER', 'ADMIN', 'MODERATOR'])")
    })
    it('makeValibotEnumExpression generates v.picklist()', () => {
      expect(makeValibotEnumExpression(values)).toBe("picklist(['USER', 'ADMIN', 'MODERATOR'])")
    })
    it('makeArktypeEnumExpression generates union string', () => {
      expect(makeArktypeEnumExpression(values)).toBe("\"'USER' | 'ADMIN' | 'MODERATOR'\"")
    })
    it('makeEffectEnumExpression generates Schema.Literal()', () => {
      expect(makeEffectEnumExpression(values)).toBe("Schema.Literal('USER', 'ADMIN', 'MODERATOR')")
    })
    it('handles single value', () => {
      expect(makeZodEnumExpression(['ACTIVE'])).toBe("enum(['ACTIVE'])")
      expect(makeValibotEnumExpression(['ACTIVE'])).toBe("picklist(['ACTIVE'])")
      expect(makeArktypeEnumExpression(['ACTIVE'])).toBe('"\'ACTIVE\'"')
      expect(makeEffectEnumExpression(['ACTIVE'])).toBe("Schema.Literal('ACTIVE')")
    })
  })

  describe('findMissingAnnotations', () => {
    const extractZod = makeValidationExtractor('@z.')

    it('returns empty array when all fields have annotations', () => {
      const models = [
        {
          name: 'User',
          fields: [
            { name: 'id', kind: 'scalar', documentation: '@z.uuid()' },
            { name: 'name', kind: 'scalar', documentation: '@z.string()' },
          ],
        },
      ]
      expect(findMissingAnnotations(models, extractZod)).toStrictEqual([])
    })

    it('detects fields missing annotations', () => {
      const models = [
        {
          name: 'User',
          fields: [
            { name: 'id', kind: 'scalar', documentation: '@z.uuid()' },
            { name: 'name', kind: 'scalar', documentation: 'Display name' },
          ],
        },
      ]
      expect(findMissingAnnotations(models, extractZod)).toStrictEqual([
        { modelName: 'User', fieldName: 'name' },
      ])
    })

    it('excludes relation fields (kind=object)', () => {
      const models = [
        {
          name: 'User',
          fields: [
            { name: 'id', kind: 'scalar', documentation: '@z.uuid()' },
            { name: 'posts', kind: 'object', documentation: undefined },
          ],
        },
      ]
      expect(findMissingAnnotations(models, extractZod)).toStrictEqual([])
    })

    it('detects fields with undefined documentation', () => {
      const models = [
        {
          name: 'User',
          fields: [{ name: 'id', kind: 'scalar', documentation: undefined }],
        },
      ]
      expect(findMissingAnnotations(models, extractZod)).toStrictEqual([
        { modelName: 'User', fieldName: 'id' },
      ])
    })

    it('detects across multiple models', () => {
      const models = [
        {
          name: 'User',
          fields: [
            { name: 'id', kind: 'scalar', documentation: '@z.uuid()' },
            { name: 'email', kind: 'scalar', documentation: undefined },
          ],
        },
        {
          name: 'Post',
          fields: [
            { name: 'id', kind: 'scalar', documentation: undefined },
            { name: 'title', kind: 'scalar', documentation: '@z.string()' },
          ],
        },
      ]
      expect(findMissingAnnotations(models, extractZod)).toStrictEqual([
        { modelName: 'User', fieldName: 'email' },
        { modelName: 'Post', fieldName: 'id' },
      ])
    })
  })

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
  // Annotation Extractor
  // ============================================================================

  describe('makeAnnotationExtractor', () => {
    const extractZod = makeAnnotationExtractor('@z.')

    it('extracts annotation after prefix', () => {
      expect(extractZod('User name\n@z.uuid()')).toBe('uuid()')
    })
    it('returns null when no matching annotation', () => {
      expect(extractZod('User name\n@v.string()')).toBeNull()
    })
    it('extracts from multiline with multiple annotations', () => {
      const extractValibot = makeAnnotationExtractor('@v.')
      expect(extractValibot('desc\n@z.uuid()\n@v.pipe(v.string())')).toBe('pipe(v.string())')
    })
  })

  // ============================================================================
  // JSDoc
  // ============================================================================

  describe('makeJsDoc', () => {
    it('generates JSDoc from documentation', () => {
      expect(makeJsDoc('User name')).toBe('/**\n * User name\n */\n')
    })
    it('excludes annotation lines', () => {
      expect(makeJsDoc('User name\n@z.uuid()\n@v.string()')).toBe('/**\n * User name\n */\n')
    })
    it('returns empty string for undefined', () => {
      expect(makeJsDoc(undefined)).toBe('')
    })
    it('returns empty string for annotation-only doc', () => {
      expect(makeJsDoc('@z.uuid()')).toBe('')
    })
  })

  // ============================================================================
  // Zod Object & Cardinality
  // ============================================================================

  describe('makeZodObject', () => {
    it('wraps with z.object by default', () => {
      expect(makeZodObject('inner')).toBe('z.object({inner})')
    })
    it('wraps with z.strictObject', () => {
      expect(makeZodObject('inner', 'strictObject')).toBe('z.strictObject({inner})')
    })
    it('wraps with z.looseObject', () => {
      expect(makeZodObject('inner', 'looseObject')).toBe('z.looseObject({inner})')
    })
  })

  describe('makeZodCardinality', () => {
    it('returns expr as-is for required non-list', () => {
      expect(makeZodCardinality('z.string()', false, true)).toBe('z.string()')
    })
    it('wraps with z.array for list', () => {
      expect(makeZodCardinality('z.string()', true, true)).toBe('z.array(z.string())')
    })
    it('appends .exactOptional() for optional', () => {
      expect(makeZodCardinality('z.string()', false, false)).toBe('z.string().exactOptional()')
    })
    it('wraps array and optional together', () => {
      expect(makeZodCardinality('z.string()', true, false)).toBe(
        'z.array(z.string()).exactOptional()',
      )
    })
  })

  // ============================================================================
  // Valibot Object & Cardinality
  // ============================================================================

  describe('makeValibotObject', () => {
    it('wraps with v.object by default', () => {
      expect(makeValibotObject('inner')).toBe('v.object({inner})')
    })
    it('wraps with v.strictObject', () => {
      expect(makeValibotObject('inner', 'strictObject')).toBe('v.strictObject({inner})')
    })
    it('wraps with v.looseObject', () => {
      expect(makeValibotObject('inner', 'looseObject')).toBe('v.looseObject({inner})')
    })
  })

  describe('makeValibotCardinality', () => {
    it('returns expr as-is for required non-list', () => {
      expect(makeValibotCardinality('v.string()', false, true)).toBe('v.string()')
    })
    it('wraps with v.array for list', () => {
      expect(makeValibotCardinality('v.string()', true, true)).toBe('v.array(v.string())')
    })
    it('wraps with v.exactOptional for optional', () => {
      expect(makeValibotCardinality('v.string()', false, false)).toBe(
        'v.exactOptional(v.string())',
      )
    })
    it('wraps array and optional together', () => {
      expect(makeValibotCardinality('v.string()', true, false)).toBe(
        'v.exactOptional(v.array(v.string()))',
      )
    })
  })

  // ============================================================================
  // ArkType Helpers
  // ============================================================================

  describe('makeArktypeInfer', () => {
    it('generates ArkType infer type', () => {
      expect(makeArktypeInfer('User')).toBe('export type User = typeof UserSchema.infer')
    })
    it('works with different model name', () => {
      expect(makeArktypeInfer('Post')).toBe('export type Post = typeof PostSchema.infer')
    })
  })

  describe('makeArktypeSchema', () => {
    it('generates ArkType schema definition', () => {
      expect(makeArktypeSchema('User', '  id: "string"')).toBe(
        'export const UserSchema = type({\n  id: "string"\n})',
      )
    })
  })

  describe('makeArktypeProperties', () => {
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: '"string.uuid"',
        isRequired: true,
        comment: ['Primary key'],
      },
    ]

    it('generates properties with comments', () => {
      const result = makeArktypeProperties(fields, true)
      expect(result).toBe('  /** Primary key */\n  id: "string.uuid",')
    })
    it('generates properties without comments', () => {
      const result = makeArktypeProperties(fields, false)
      expect(result).toBe('  id: "string.uuid",')
    })
    it('uses "unknown" for null validation', () => {
      const nullFields = [{ ...fields[0], validation: null, comment: [] }]
      const result = makeArktypeProperties(nullFields, false)
      expect(result).toBe('  id: "unknown",')
    })
  })

  // ============================================================================
  // Effect Helpers
  // ============================================================================

  describe('makeEffectInfer', () => {
    it('generates Effect infer type', () => {
      expect(makeEffectInfer('User')).toBe(
        'export type User = Schema.Schema.Type<typeof UserSchema>',
      )
    })
    it('works with different model name', () => {
      expect(makeEffectInfer('Post')).toBe(
        'export type Post = Schema.Schema.Type<typeof PostSchema>',
      )
    })
  })

  describe('makeEffectSchema', () => {
    it('generates Effect schema definition', () => {
      expect(makeEffectSchema('User', '  id: Schema.String')).toBe(
        'export const UserSchema = Schema.Struct({\n  id: Schema.String\n})',
      )
    })
  })

  describe('makeEffectProperties', () => {
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'Schema.String',
        isRequired: true,
        comment: ['Primary key'],
      },
    ]

    it('generates properties with comments', () => {
      const result = makeEffectProperties(fields, true)
      expect(result).toBe('  /** Primary key */\n  id: Schema.String,')
    })
    it('generates properties without comments', () => {
      const result = makeEffectProperties(fields, false)
      expect(result).toBe('  id: Schema.String,')
    })
    it('uses Schema.Unknown for null validation', () => {
      const nullFields = [{ ...fields[0], validation: null, comment: [] }]
      const result = makeEffectProperties(nullFields, false)
      expect(result).toBe('  id: Schema.Unknown,')
    })
  })

  // ============================================================================
  // DBML Ref Name
  // ============================================================================

  describe('makeRefName', () => {
    it('uses provided name', () => {
      expect(
        makeRefName({
          name: 'custom_fk',
          fromTable: 'Post',
          fromColumn: 'userId',
          toTable: 'User',
          toColumn: 'id',
        }),
      ).toBe('custom_fk')
    })
    it('generates name from table/column when no name', () => {
      expect(
        makeRefName({
          fromTable: 'Post',
          fromColumn: 'userId',
          toTable: 'User',
          toColumn: 'id',
        }),
      ).toBe('Post_userId_User_id_fk')
    })
  })

  // ============================================================================
  // combineKeys
  // ============================================================================

  describe('combineKeys', () => {
    it('returns single key as-is', () => {
      expect(combineKeys(['id'])).toBe('id')
    })
    it('wraps multiple keys in parentheses', () => {
      expect(combineKeys(['id', 'name'])).toBe('(id, name)')
    })
    it('handles three keys', () => {
      expect(combineKeys(['a', 'b', 'c'])).toBe('(a, b, c)')
    })
  })

  // ============================================================================
  // ectoTypeToTypespec
  // ============================================================================

  describe('ectoTypeToTypespec', () => {
    it('converts string to String.t()', () => {
      expect(ectoTypeToTypespec('string')).toBe('String.t()')
    })
    it('converts integer to integer()', () => {
      expect(ectoTypeToTypespec('integer')).toBe('integer()')
    })
    it('converts binary_id to Ecto.UUID.t()', () => {
      expect(ectoTypeToTypespec('binary_id')).toBe('Ecto.UUID.t()')
    })
    it('converts utc_datetime to DateTime.t()', () => {
      expect(ectoTypeToTypespec('utc_datetime')).toBe('DateTime.t()')
    })
    it('returns term() for unknown types', () => {
      expect(ectoTypeToTypespec('unknown_type')).toBe('term()')
    })
  })

  // ============================================================================
  // schemaFromFields
  // ============================================================================

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
      const mockProps = (
        _fields: readonly { readonly fieldName: string }[],
        _comment: boolean,
      ) => _fields.map((f) => f.fieldName).join(', ')

      // biome-ignore lint/suspicious/noExplicitAny: test mock
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
      const mockProps = (
        _fields: readonly { readonly fieldName: string }[],
        comment: boolean,
      ) => {
        receivedComment = comment
        return 'props'
      }

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      schemaFromFields(fields, false, mockSchema, mockProps as any)
      expect(receivedComment).toBe(false)
    })
  })
})
