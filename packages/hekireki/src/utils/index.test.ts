import { describe, expect, it } from 'vitest'
import {
  escapeNote,
  excludeManyToOneRelations,
  findMissingAnnotations,
  formatConstraints,
  generateEnum,
  generateIndex,
  generatePrismaColumn,
  generateRef,
  groupByModel,
  isFields,
  isRelationshipType,
  makeCapitalized,
  makeDocumentParser,
  makePropertiesGenerator,
  makeRelationLine,
  makeRelationLineFromRelation,
  makeSnakeCase,
  makeValidationExtractor,
  makeZodInfer,
  makeZodSchema,
  makeZodSchemas,
  makeValibotInfer,
  makeValibotSchema,
  makeValibotSchemas,
  parseRelation,
  prismaTypeToEctoType,
  quote,
  removeDuplicateRelations,
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
      expect(result).toStrictEqual(['Unique identifier for the user', '@v.pipe(v.string(), v.uuid())'])
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
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'name',
        comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
        validation: 'string().min(1).max(50)',
      },
    ] as const

    const valibotFields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        comment: ['Primary key', '@z.uuid()'],
        validation: 'pipe(v.string(), v.uuid())',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'name',
        comment: ['Display name', '@z.string().min(1).max(50)'],
        validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
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

  describe('makeZodSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
          },
        ],
        true,
      )
      const expected = `export const UserSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50)
})`
      expect(result).toBe(expected)
    })
    it.concurrent('schemas comment false', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
          },
        ],
        false,
      )
      const expected = `export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50)
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

  describe('makeValibotSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeValibotSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
          },
        ],
        true,
      )

      const expected = `export const UserSchema = v.object({
  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
      expect(result).toBe(expected)
    })
    it.concurrent('schemas comment false', () => {
      const result = makeValibotSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
          },
        ],
        false,
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
        parseRelation(
          '@relation ProjectTeam.project_id TeamMember.team_member_id zero-to-many',
        ),
      ).toStrictEqual({
        fromModel: 'ProjectTeam',
        toModel: 'TeamMember',
        fromField: 'project_id',
        toField: 'team_member_id',
        type: 'zero-to-many',
      })
    })
    it.concurrent('returns null for optional suffix', () => {
      expect(
        parseRelation('@relation User.id Settings.user_id one-to-one-optional'),
      ).toStrictEqual(null)
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

  describe('makeRelationLine', () => {
    const testCases = [
      { input: 'zero-one-to-zero-one', expected: '|o--|o' },
      { input: 'zero-one-to-one', expected: '|o--||' },
      { input: 'zero-one-to-zero-many', expected: '|o--}o' },
      { input: 'zero-one-to-many', expected: '|o--}|' },
      { input: 'zero-one-to-zero-one-optional', expected: '|o..|o' },
      { input: 'zero-one-to-one-optional', expected: '|o..||' },
      { input: 'one-to-zero-one', expected: '||--|o' },
      { input: 'one-to-one', expected: '||--||' },
      { input: 'one-to-zero-many', expected: '||--}o' },
      { input: 'one-to-many', expected: '||--}|' },
      { input: 'one-to-zero-one-optional', expected: '||..|o' },
      { input: 'one-to-one-optional', expected: '||..||' },
      { input: 'many-to-zero-one', expected: '}|--|o' },
      { input: 'many-to-one', expected: '}|--||' },
      { input: 'many-to-many', expected: '}|--}|' },
      { input: 'many-to-many-optional', expected: '}|..}|' },
    ]
    it.each(testCases)('should return $expected for input $input', ({ input, expected }) => {
      const result = makeRelationLine(input)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(expected)
      }
    })

    it('returns error for invalid input', () => {
      const result = makeRelationLine('invalid')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid input format: invalid')
      }
    })
    it('returns error for invalid from relationship', () => {
      const result = makeRelationLine('invalid-to-one')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid relationship: invalid')
      }
    })
    it('returns error for invalid to relationship', () => {
      const result = makeRelationLine('one-to-invalid')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid relationship: invalid')
      }
    })
  })

  describe('makeRelationLineFromRelation', () => {
    it.concurrent('generates relation line', () => {
      const result = makeRelationLineFromRelation({
        fromModel: 'User',
        fromField: 'id',
        toModel: 'Post',
        toField: 'userId',
        type: 'one-to-many',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('    User ||--}| Post : "(id) - (userId)"')
      }
    })
    it.concurrent('returns error for unknown type', () => {
      const result = makeRelationLineFromRelation({
        fromModel: 'User',
        fromField: 'id',
        toModel: 'Post',
        toField: 'userId',
        type: 'unknown-type',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid input format: unknown-type')
      }
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

  describe('quote', () => {
    it('wraps and escapes', () => {
      expect(quote("User's bio")).toBe("'User\\'s bio'")
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

  describe('generateEnum', () => {
    it('generates enum', () => {
      expect(generateEnum({ name: 'Role', values: ['USER', 'ADMIN'] })).toBe(
        'Enum Role {\n  USER\n  ADMIN\n}',
      )
    })
  })

  describe('generateIndex', () => {
    it('generates pk index', () => {
      expect(generateIndex({ columns: ['id'], isPrimaryKey: true })).toBe('    id [pk]')
    })
    it('generates composite unique index', () => {
      expect(generateIndex({ columns: ['a', 'b'], isUnique: true })).toBe('    (a, b) [unique]')
    })
  })

  describe('generateRef', () => {
    it('generates simple ref', () => {
      expect(
        generateRef({
          name: 'Post_userId_fk',
          fromTable: 'Post',
          fromColumn: 'userId',
          toTable: 'User',
          toColumn: 'id',
          type: '>',
        }),
      ).toBe('Ref Post_userId_fk: Post.userId > User.id')
    })
    it('generates ref with onDelete', () => {
      expect(
        generateRef({
          name: 'Post_userId_fk',
          fromTable: 'Post',
          fromColumn: 'userId',
          toTable: 'User',
          toColumn: 'id',
          type: '>',
          onDelete: 'Cascade',
        }),
      ).toBe('Ref Post_userId_fk: Post.userId > User.id [delete: Cascade]')
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

  describe('generatePrismaColumn', () => {
    it('generates pk column', () => {
      expect(
        generatePrismaColumn({ name: 'id', type: 'String', isPrimaryKey: true }),
      ).toBe('  id String [pk]')
    })
    it('generates column with all constraints', () => {
      expect(
        generatePrismaColumn({
          name: 'email',
          type: 'String',
          isUnique: true,
          isNotNull: true,
          note: "User's email",
        }),
      ).toBe("  email String [unique, not null, note: 'User\\'s email']")
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
    it('returns string for unsupported types', () => {
      expect(prismaTypeToEctoType('Json')).toBe('string')
      expect(prismaTypeToEctoType('Float')).toBe('string')
      expect(prismaTypeToEctoType('BigInt')).toBe('string')
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
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'name',
          comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
          validation: 'string().min(1).max(50)',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'id',
          comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
          validation: 'uuid()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'title',
          comment: ['Article title', '@v.pipe(v.string(), v.minLength(1), v.maxLength(100))'],
          validation: 'string().min(1).max(100)',
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
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'posts',
            comment: ['One-to-many'],
            validation: null,
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
          fields: [
            { name: 'id', kind: 'scalar', documentation: undefined },
          ],
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
})
