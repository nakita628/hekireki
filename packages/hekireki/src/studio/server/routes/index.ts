import { createRoute, z } from '@hono/zod-openapi'

export const SchemaFileSchema = z
  .object({
    path: z
      .string()
      .openapi({
        description:
          'The file path as Studio loaded it (the value to send back as `FileWrite.path`)',
      }),
    content: z.string().openapi({ description: 'The whole file content' }),
  })
  .openapi({
    required: ['path', 'content'],
    description: 'One schema file on disk, as Studio read it.',
    example: { path: 'prisma/schema.prisma', content: 'model User {\n  id Int @id\n}\n' },
  })
  .openapi('SchemaFile')

export type SchemaFile = z.infer<typeof SchemaFileSchema>

export const FieldKindSchema = z
  .enum(['scalar', 'object', 'enum', 'unsupported'])
  .openapi({ description: 'What a field holds, as Prisma classifies it.' })
  .openapi('FieldKind')

export type FieldKind = z.infer<typeof FieldKindSchema>

export const FieldRelationSchema = z
  .object({
    name: z
      .string()
      .openapi({
        description: 'The relation name (`@relation("name")`, or the one Prisma derived)',
      }),
    fromFields: z
      .array(z.string())
      .openapi({ description: 'The fields on this model that hold the foreign key' }),
    toFields: z
      .array(z.string())
      .openapi({ description: 'The fields on the other model the key references' }),
    onDelete: z
      .string()
      .nullable()
      .openapi({ description: 'The `onDelete` referential action, when declared' }),
    onUpdate: z
      .string()
      .nullable()
      .openapi({ description: 'The `onUpdate` referential action, when declared' }),
  })
  .openapi({
    required: ['name', 'fromFields', 'toFields', 'onDelete', 'onUpdate'],
    description: 'The `@relation(...)` attribute of a relation field.',
    example: {
      name: 'PostToUser',
      fromFields: ['authorId'],
      toFields: ['id'],
      onDelete: 'Cascade',
      onUpdate: null,
    },
  })
  .openapi('FieldRelation')

export type FieldRelation = z.infer<typeof FieldRelationSchema>

export const FieldSchema = z
  .object({
    name: z.string().openapi({ description: 'The field name' }),
    dbName: z
      .string()
      .nullable()
      .openapi({ description: 'The column name from `@map`, when it differs' }),
    kind: FieldKindSchema.openapi({ description: 'What the field holds' }),
    type: z.string().openapi({ description: 'The Prisma type: a scalar, a model or an enum name' }),
    isList: z.boolean().openapi({ description: 'Whether the field is a list (`String[]`)' }),
    isRequired: z.boolean().openapi({ description: 'Whether the field is required (no `?`)' }),
    isId: z.boolean().openapi({ description: 'Whether the field is `@id`' }),
    isUnique: z.boolean().openapi({ description: 'Whether the field is `@unique`' }),
    isUpdatedAt: z.boolean().openapi({ description: 'Whether the field is `@updatedAt`' }),
    isForeignKey: z
      .boolean()
      .openapi({
        description: 'Whether the field holds the foreign key of a relation on this model',
      }),
    default: z
      .string()
      .nullable()
      .openapi({ description: 'The `@default(...)` value rendered as written, when declared' }),
    nativeType: z
      .string()
      .nullable()
      .openapi({ description: 'The `@db.*` native type rendered as written, when declared' }),
    documentation: z
      .string()
      .nullable()
      .openapi({ description: 'The `///` doc comment with hekireki annotations stripped' }),
    annotations: z
      .array(z.string())
      .openapi({
        description: 'The hekireki annotation lines (`@z.*`, `@v.*`, ...) found in the doc comment',
      }),
    relation: FieldRelationSchema.nullable().openapi({
      description: 'The `@relation(...)` attribute of a relation field',
    }),
    attributes: z
      .array(z.string())
      .openapi({
        description:
          'Every attribute rendered as written (`@id`, `@default(now())`, `@map("...")`, ...)',
      }),
  })
  .openapi({
    required: [
      'name',
      'dbName',
      'kind',
      'type',
      'isList',
      'isRequired',
      'isId',
      'isUnique',
      'isUpdatedAt',
      'isForeignKey',
      'default',
      'nativeType',
      'documentation',
      'annotations',
      'relation',
      'attributes',
    ],
    description: 'One field of a model.',
    example: {
      name: 'authorId',
      dbName: 'author_id',
      kind: 'scalar',
      type: 'Int',
      isList: false,
      isRequired: true,
      isId: false,
      isUnique: false,
      isUpdatedAt: false,
      isForeignKey: true,
      default: null,
      nativeType: null,
      documentation: 'The author of the post',
      annotations: ['@z.int().positive()'],
      relation: null,
      attributes: ['@map("author_id")'],
    },
  })
  .openapi('Field')

export type Field = z.infer<typeof FieldSchema>

export const IndexTypeSchema = z
  .enum(['id', 'unique', 'normal', 'fulltext'])
  .openapi({ description: 'The kind of index a `@@` attribute declares.' })
  .openapi('IndexType')

export type IndexType = z.infer<typeof IndexTypeSchema>

export const IndexSchema = z
  .object({
    type: IndexTypeSchema.openapi({ description: 'The kind of index' }),
    name: z
      .string()
      .nullable()
      .openapi({ description: 'The Prisma-side index name, when declared' }),
    dbName: z
      .string()
      .nullable()
      .openapi({ description: 'The database-side index name (`map`), when declared' }),
    fields: z.array(z.string()).openapi({ description: 'The fields the index covers, in order' }),
    attribute: z.string().openapi({ description: 'The attribute rendered as written' }),
  })
  .openapi({
    required: ['type', 'name', 'dbName', 'fields', 'attribute'],
    description: 'A `@@id`, `@@unique`, `@@index` or `@@fulltext` attribute of a model.',
    example: {
      type: 'unique',
      name: null,
      dbName: 'users_email_key',
      fields: ['email'],
      attribute: '@@unique([email], map: "users_email_key")',
    },
  })
  .openapi('Index')

export type Index = z.infer<typeof IndexSchema>

export const LocationSchema = z
  .object({
    file: z.string().openapi({ description: 'The file that declares the block' }),
    line: z.int32().openapi({ description: 'The 1-based line of the `model` / `enum` keyword' }),
  })
  .openapi({
    required: ['file', 'line'],
    description: 'Where a block starts in the schema files.',
    example: { file: 'prisma/schema.prisma', line: 12 },
  })
  .openapi('Location')

export type Location = z.infer<typeof LocationSchema>

export const ModelSchema = z
  .object({
    name: z.string().openapi({ description: 'The model name' }),
    dbName: z
      .string()
      .nullable()
      .openapi({ description: 'The table name from `@@map`, when it differs' }),
    documentation: z
      .string()
      .nullable()
      .openapi({ description: 'The `///` doc comment with hekireki annotations stripped' }),
    annotations: z
      .array(z.string())
      .openapi({ description: 'The hekireki annotation lines found in the doc comment' }),
    fields: z.array(FieldSchema).openapi({ description: 'The fields in declaration order' }),
    primaryKey: z
      .array(z.string())
      .nullable()
      .openapi({ description: 'The `@@id` fields, when the primary key is composite' }),
    indexes: z.array(IndexSchema).openapi({ description: 'The `@@` index attributes' }),
    attributes: z
      .array(z.string())
      .openapi({ description: 'Every `@@` attribute rendered as written' }),
    location: LocationSchema.nullable().openapi({
      description: 'Where the block starts (null when it could not be located)',
    }),
  })
  .openapi({
    required: [
      'name',
      'dbName',
      'documentation',
      'annotations',
      'fields',
      'primaryKey',
      'indexes',
      'attributes',
      'location',
    ],
    description: 'One model of the schema.',
    example: {
      name: 'User',
      dbName: 'users',
      documentation: 'A registered account',
      annotations: [],
      fields: [
        {
          name: 'id',
          dbName: null,
          kind: 'scalar',
          type: 'Int',
          isList: false,
          isRequired: true,
          isId: true,
          isUnique: false,
          isUpdatedAt: false,
          isForeignKey: false,
          default: 'autoincrement()',
          nativeType: null,
          documentation: null,
          annotations: [],
          relation: null,
          attributes: ['@id', '@default(autoincrement())'],
        },
      ],
      primaryKey: null,
      indexes: [],
      attributes: ['@@map("users")'],
      location: { file: 'prisma/schema.prisma', line: 12 },
    },
  })
  .openapi('Model')

export type Model = z.infer<typeof ModelSchema>

export const EnumValueSchema = z
  .object({
    name: z.string().openapi({ description: 'The member name' }),
    dbName: z
      .string()
      .nullable()
      .openapi({ description: 'The stored value from `@map`, when it differs' }),
  })
  .openapi({
    required: ['name', 'dbName'],
    description: 'One member of an enum.',
    example: { name: 'ADMIN', dbName: 'admin' },
  })
  .openapi('EnumValue')

export type EnumValue = z.infer<typeof EnumValueSchema>

export const EnumSchema = z
  .object({
    name: z.string().openapi({ description: 'The enum name' }),
    dbName: z
      .string()
      .nullable()
      .openapi({ description: 'The type name from `@@map`, when it differs' }),
    documentation: z.string().nullable().openapi({ description: 'The `///` doc comment' }),
    values: z.array(EnumValueSchema).openapi({ description: 'The members in declaration order' }),
    location: LocationSchema.nullable().openapi({
      description: 'Where the block starts (null when it could not be located)',
    }),
  })
  .openapi({
    required: ['name', 'dbName', 'documentation', 'values', 'location'],
    description: 'One enum of the schema.',
    example: {
      name: 'Role',
      dbName: null,
      documentation: 'What an account may do',
      values: [
        { name: 'ADMIN', dbName: 'admin' },
        { name: 'VIEWER', dbName: null },
      ],
      location: { file: 'prisma/schema.prisma', line: 40 },
    },
  })
  .openapi('Enum')

export type Enum = z.infer<typeof EnumSchema>

export const RelationOriginSchema = z
  .enum(['inferred', 'annotated', 'implicit-many-to-many'])
  .openapi({ description: 'Where a relation came from.' })
  .openapi('RelationOrigin')

export type RelationOrigin = z.infer<typeof RelationOriginSchema>

export const CardinalitySchema = z
  .enum(['zero-one', 'one', 'zero-many', 'many'])
  .openapi({ description: 'How many rows one end of a relation points at.' })
  .openapi('Cardinality')

export type Cardinality = z.infer<typeof CardinalitySchema>

export const RelationEndSchema = z
  .object({
    model: z.string().openapi({ description: 'The model on this end' }),
    field: z
      .string()
      .openapi({
        description:
          'The field on this end (the key field, or the list field of an implicit many-to-many)',
      }),
    cardinality: CardinalitySchema.openapi({ description: 'How many rows this end points at' }),
  })
  .openapi({
    required: ['model', 'field', 'cardinality'],
    description: 'One end of a relation.',
    example: { model: 'Post', field: 'authorId', cardinality: 'many' },
  })
  .openapi('RelationEnd')

export type RelationEnd = z.infer<typeof RelationEndSchema>

export const RelationSchema = z
  .object({
    id: z
      .string()
      .openapi({ description: 'A stable id built from both ends (`From.field->To.field`)' }),
    name: z
      .string()
      .nullable()
      .openapi({ description: 'The relation name, when one is declared or derived' }),
    origin: RelationOriginSchema.openapi({ description: 'Where the relation came from' }),
    from: RelationEndSchema.openapi({ description: 'The referenced end' }),
    to: RelationEndSchema.openapi({ description: 'The referencing end' }),
    onDelete: z
      .string()
      .nullable()
      .openapi({ description: 'The `onDelete` referential action, when declared' }),
    onUpdate: z
      .string()
      .nullable()
      .openapi({ description: 'The `onUpdate` referential action, when declared' }),
  })
  .openapi({
    required: ['id', 'name', 'origin', 'from', 'to', 'onDelete', 'onUpdate'],
    description: 'A relation between two models, drawn as one edge in the ER diagram.',
    example: {
      id: 'User.id->Post.authorId',
      name: 'PostToUser',
      origin: 'inferred',
      from: { model: 'User', field: 'id', cardinality: 'one' },
      to: { model: 'Post', field: 'authorId', cardinality: 'many' },
      onDelete: 'Cascade',
      onUpdate: null,
    },
  })
  .openapi('Relation')

export type Relation = z.infer<typeof RelationSchema>

export const SchemaSchema = z
  .object({
    files: z
      .array(SchemaFileSchema)
      .openapi({ description: 'The files the schema was parsed from' }),
    provider: z
      .string()
      .nullable()
      .openapi({ description: 'The `datasource` provider, when one is declared' }),
    models: z.array(ModelSchema).openapi({ description: 'Every model in declaration order' }),
    enums: z.array(EnumSchema).openapi({ description: 'Every enum in declaration order' }),
    relations: z
      .array(RelationSchema)
      .openapi({ description: 'Every relation between the models' }),
  })
  .openapi({
    required: ['files', 'provider', 'models', 'enums', 'relations'],
    description: 'The parsed Prisma schema as the UI consumes it.',
    example: {
      files: [{ path: 'prisma/schema.prisma', content: 'model User {\n  id Int @id\n}\n' }],
      provider: 'postgresql',
      models: [],
      enums: [],
      relations: [],
    },
  })
  .openapi('Schema')

export type Schema = z.infer<typeof SchemaSchema>

export const SnapshotSchema = z
  .object({
    schema: SchemaSchema.nullable().openapi({
      description: 'The last schema that parsed, or null before the first successful parse',
    }),
    error: z
      .string()
      .nullable()
      .openapi({ description: 'The Prisma error of the latest parse, or null when it succeeded' }),
    updatedAt: z.iso
      .datetime()
      .openapi({
        description:
          'When the files were last read (ISO 8601); the event stream announces every change of it',
      }),
    files: z
      .array(SchemaFileSchema)
      .openapi({ description: 'The files on disk as of the latest read' }),
  })
  .brand<'Snapshot'>()
  .openapi({
    required: ['schema', 'error', 'updatedAt', 'files'],
    description:
      'The latest parse result. `schema` is the last schema that parsed (null until one does) and\n`error` the current Prisma error, so a broken edit never blanks the UI. `files` always reflects\nthe disk, even while the schema is broken.',
    example: {
      schema: null,
      error:
        'error: Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
      updatedAt: '2026-09-02T00:00:00.000Z',
      files: [{ path: 'prisma/schema.prisma', content: 'model User {\n  id Nope @id\n}\n' }],
    },
  })
  .openapi('Snapshot')

export type Snapshot = z.infer<typeof SnapshotSchema>

export const InternalServerProblemSchema = z
  .object({
    type: z
      .literal('/problems/internal-server-error')
      .openapi({ description: 'Problem type identifier (relative URI reference)' }),
    title: z
      .literal('Internal Server Error')
      .openapi({ description: 'Short, human-readable summary of the problem type' }),
    status: z
      .literal(500)
      .openapi({ description: 'HTTP status code, restated in the body per RFC 9457' }),
    detail: z
      .string()
      .openapi({ description: 'Human-readable explanation specific to this occurrence' }),
    instance: z
      .string()
      .openapi({ description: 'URI reference identifying this occurrence (the request path)' }),
  })
  .openapi({
    required: ['type', 'title', 'status', 'detail', 'instance'],
    description:
      'RFC 9457 Problem Details for a contract violation (the server could not produce a response\nmatching this document) or any other unexpected failure.',
    example: {
      type: '/problems/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance: '/api/schema',
    },
  })
  .openapi('InternalServerProblem')

export type InternalServerProblem = z.infer<typeof InternalServerProblemSchema>

export const NotFoundProblemSchema = z
  .object({
    type: z
      .literal('/problems/not-found')
      .openapi({ description: 'Problem type identifier (relative URI reference)' }),
    title: z
      .literal('Not Found')
      .openapi({ description: 'Short, human-readable summary of the problem type' }),
    status: z
      .literal(404)
      .openapi({ description: 'HTTP status code, restated in the body per RFC 9457' }),
    detail: z
      .string()
      .openapi({ description: 'Human-readable explanation specific to this occurrence' }),
    instance: z
      .string()
      .openapi({ description: 'URI reference identifying this occurrence (the request path)' }),
  })
  .openapi({
    required: ['type', 'title', 'status', 'detail', 'instance'],
    description:
      'RFC 9457 Problem Details for a model or schema file that does not exist in the loaded schema.',
    example: {
      type: '/problems/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'Unknown model "Nope".',
      instance: '/api/db/rows/Nope',
    },
  })
  .openapi('NotFoundProblem')

export type NotFoundProblem = z.infer<typeof NotFoundProblemSchema>

export const FieldErrorSchema = z
  .object({
    field: z
      .string()
      .openapi({ description: 'Dot-separated path of the field the error occurred on' }),
    message: z.string().openapi({ description: 'The validation message' }),
  })
  .openapi({
    required: ['field', 'message'],
    description: 'One field that failed validation.',
    example: { field: 'take', message: 'take must be 1000 or fewer' },
  })
  .openapi('FieldError')

export type FieldError = z.infer<typeof FieldErrorSchema>

export const ValidationProblemSchema = z
  .object({
    type: z
      .literal('/problems/validation-failed')
      .openapi({ description: 'Problem type identifier (relative URI reference)' }),
    title: z
      .literal('Validation Failed')
      .openapi({ description: 'Short, human-readable summary of the problem type' }),
    status: z
      .literal(422)
      .openapi({ description: 'HTTP status code, restated in the body per RFC 9457' }),
    detail: z
      .string()
      .openapi({ description: 'Human-readable explanation specific to this occurrence' }),
    instance: z
      .string()
      .openapi({ description: 'URI reference identifying this occurrence (the request path)' }),
    errors: z
      .array(FieldErrorSchema)
      .openapi({ description: 'Extension member: one entry per field that failed validation' }),
  })
  .openapi({
    required: ['type', 'title', 'status', 'detail', 'instance', 'errors'],
    description:
      'RFC 9457 Problem Details for a request that failed validation.\n`errors` is an extension member (RFC 9457 §3.2). The `@hono/zod-openapi` default hook returns\nthis shape for every route, short-circuiting before the handler; a write that the database\nrejects is reported the same way with the offending field.',
    example: {
      type: '/problems/validation-failed',
      title: 'Validation Failed',
      status: 422,
      detail: 'The request failed validation. See `errors` for the offending fields.',
      instance: '/api/db/rows/User',
      errors: [{ field: 'take', message: 'take must be 1000 or fewer' }],
    },
  })
  .openapi('ValidationProblem')

export type ValidationProblem = z.infer<typeof ValidationProblemSchema>

export const SchemaFilePathSchema = z
  .string({ error: 'Path must be a non-empty string' })
  .min(1, { error: 'Path must not be empty' })
  .brand<'SchemaFilePath'>()
  .openapi({
    description:
      'A schema file path exactly as Studio loaded it (relative to the working directory, or absolute\nwhen the schema lives outside it). Only the loaded files can be written back.',
  })
  .openapi('SchemaFilePath')

export type SchemaFilePath = z.infer<typeof SchemaFilePathSchema>

export const SchemaTextSchema = z
  .string({ error: 'Schema text must be a string' })
  .brand<'SchemaText'>()
  .openapi({
    description: 'Prisma schema source text (a whole file, or the editor buffer being typed).',
  })
  .openapi('SchemaText')

export type SchemaText = z.infer<typeof SchemaTextSchema>

export const FileWriteSchema = z
  .object({
    path: SchemaFilePathSchema.openapi({
      description: 'The file path exactly as it appears in `Snapshot.files`',
    }),
    content: SchemaTextSchema.openapi({ description: 'The whole new file content' }),
  })
  .openapi({
    required: ['path', 'content'],
    description: 'A schema file to write back. Only a file Studio loaded can be written.',
    example: { path: 'prisma/schema.prisma', content: 'model User {\n  id Int @id\n}\n' },
  })
  .openapi('FileWrite')

export type FileWrite = z.infer<typeof FileWriteSchema>

export const DialectSchema = z
  .enum(['postgresql', 'mysql', 'sqlite'])
  .openapi({ description: 'The SQL dialect of the connected database.' })
  .openapi('Dialect')

export type Dialect = z.infer<typeof DialectSchema>

export const UrlSourceSchema = z
  .enum(['flag', 'env', 'config'])
  .openapi({ description: 'Where the database URL was found, in precedence order.' })
  .openapi('UrlSource')

export type UrlSource = z.infer<typeof UrlSourceSchema>

export const DbStatusSchema = z
  .object({
    connected: z.boolean().openapi({ description: 'Whether a driver is open' }),
    dialect: DialectSchema.nullable().openapi({ description: 'The dialect of the open driver' }),
    url: z
      .string()
      .nullable()
      .openapi({ description: 'The connection URL with its password redacted' }),
    source: UrlSourceSchema.nullable().openapi({ description: 'Where the URL was found' }),
    error: z
      .string()
      .nullable()
      .openapi({ description: 'Why no database is connected, when it is not' }),
  })
  .brand<'DbStatus'>()
  .openapi({
    required: ['connected', 'dialect', 'url', 'source', 'error'],
    description: 'The database connection as the sidebar shows it.',
    example: {
      connected: true,
      dialect: 'sqlite',
      url: 'file:./dev.db',
      source: 'env',
      error: null,
    },
  })
  .openapi('DbStatus')

export type DbStatus = z.infer<typeof DbStatusSchema>

export const CountsSchema = z
  .object({
    counts: z.record(z.string(), z.int32()).openapi({ description: 'Model name → number of rows' }),
  })
  .brand<'Counts'>()
  .openapi({
    required: ['counts'],
    description:
      'Row counts keyed by model name. Models whose table could not be counted are left out.',
    example: { counts: { User: 3, Post: 12 } },
  })
  .openapi('Counts')

export type Counts = z.infer<typeof CountsSchema>

export const ServiceUnavailableProblemSchema = z
  .object({
    type: z
      .literal('/problems/service-unavailable')
      .openapi({ description: 'Problem type identifier (relative URI reference)' }),
    title: z
      .literal('Service Unavailable')
      .openapi({ description: 'Short, human-readable summary of the problem type' }),
    status: z
      .literal(503)
      .openapi({ description: 'HTTP status code, restated in the body per RFC 9457' }),
    detail: z
      .string()
      .openapi({ description: 'Human-readable explanation specific to this occurrence' }),
    instance: z
      .string()
      .openapi({ description: 'URI reference identifying this occurrence (the request path)' }),
  })
  .openapi({
    required: ['type', 'title', 'status', 'detail', 'instance'],
    description:
      'RFC 9457 Problem Details for a request that needs the database while none is connected,\nor whose statement the database rejected.',
    example: {
      type: '/problems/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
      detail: 'No database is connected. Set DATABASE_URL or pass --url to hekireki studio.',
      instance: '/api/db/counts',
    },
  })
  .openapi('ServiceUnavailableProblem')

export type ServiceUnavailableProblem = z.infer<typeof ServiceUnavailableProblemSchema>

export const ModelNameSchema = z
  .string({
    error:
      'Model name must be a Prisma identifier (letters, digits and underscores, starting with a letter)',
  })
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, {
    error:
      'Model name must be a Prisma identifier (letters, digits and underscores, starting with a letter)',
  })
  .brand<'ModelName'>()
  .openapi({
    description:
      'A model name exactly as declared in the schema (`model User {}` → `User`).\nBranded so a use case can only be asked about a model that came in through a validated path parameter.',
  })
  .openapi('ModelName')

export type ModelName = z.infer<typeof ModelNameSchema>

export const SkipSchema = z.coerce
  .number()
  .pipe(z.int32().min(0))
  .prefault(0)
  .brand<'Skip'>()
  .openapi({
    description: 'Rows to skip before the page (0-based). Defaults to 0.',
    'x-minValue-message': 'skip must be 0 or more',
  })
  .openapi('Skip')

export type Skip = z.infer<typeof SkipSchema>

export const TakeSchema = z.coerce
  .number()
  .pipe(z.int32().min(1).max(1000))
  .prefault(100)
  .brand<'Take'>()
  .openapi({
    description: 'Rows per page (1-1000). Defaults to 100.',
    'x-maxValue-message': 'take must be 1000 or fewer',
    'x-minValue-message': 'take must be at least 1',
  })
  .openapi('Take')

export type Take = z.infer<typeof TakeSchema>

export const SearchSchema = z
  .string()
  .trim()
  .prefault('')
  .brand<'Search'>()
  .openapi({
    description:
      'Case-insensitive text every returned row must contain in one of its columns; trimmed, empty means no filter.',
  })
  .openapi('Search')

export type Search = z.infer<typeof SearchSchema>

export const RowSchema = z
  .record(z.string(), z.union([z.string(), z.float64(), z.boolean()]).nullable())
  .openapi({
    description:
      'One row keyed by Prisma field name (not column name). Values are what JSON can carry: dates\nare ISO strings, bigints are strings, JSON columns are strings.',
    example: { id: 1, email: 'ann@example.com', active: true, deletedAt: null },
  })
  .openapi('Row')

export type Row = z.infer<typeof RowSchema>

export const RowsSchema = z
  .object({
    rows: z.array(RowSchema).openapi({ description: 'The rows of the page' }),
    total: z.int32().openapi({ description: 'How many rows match the search in total' }),
    skip: z.int32().openapi({ description: 'The skip the page was read with' }),
    take: z.int32().openapi({ description: 'The take the page was read with' }),
    key: z
      .array(z.string())
      .openapi({
        description: 'The fields that identify a row (the primary key, else the unique fields)',
      }),
    columns: z
      .array(z.string())
      .openapi({ description: 'The fields the table has, in declaration order' }),
  })
  .brand<'Rows'>()
  .openapi({
    required: ['rows', 'total', 'skip', 'take', 'key', 'columns'],
    description: "One page of a model's table.",
    example: {
      rows: [{ id: 1, email: 'ann@example.com', active: true, deletedAt: null }],
      total: 1,
      skip: 0,
      take: 100,
      key: ['id'],
      columns: ['id', 'email', 'active', 'deletedAt'],
    },
  })
  .openapi('Rows')

export type Rows = z.infer<typeof RowsSchema>

export const AffectedSchema = z
  .object({ affected: z.int32().openapi({ description: "The driver's affected-row count" }) })
  .brand<'Affected'>()
  .openapi({
    required: ['affected'],
    description: 'How many rows a write touched.',
    example: { affected: 1 },
  })
  .openapi('Affected')

export type Affected = z.infer<typeof AffectedSchema>

export const InsertBodySchema = z
  .object({
    values: RowSchema.openapi({
      description: 'Field values for the new row; omitted fields take their defaults',
    }),
  })
  .openapi({
    required: ['values'],
    description: 'A row to insert.',
    example: { values: { email: 'ann@example.com' } },
  })
  .openapi('InsertBody')

export type InsertBody = z.infer<typeof InsertBodySchema>

export const UpdateBodySchema = z
  .object({
    where: RowSchema.openapi({ description: 'The key fields of the row to change' }),
    values: RowSchema.openapi({ description: 'The fields to set' }),
  })
  .openapi({
    required: ['where', 'values'],
    description: 'A change to one row.',
    example: { where: { id: 1 }, values: { email: 'ann@example.org' } },
  })
  .openapi('UpdateBody')

export type UpdateBody = z.infer<typeof UpdateBodySchema>

export const DeleteBodySchema = z
  .object({ where: RowSchema.openapi({ description: 'The key fields of the row to delete' }) })
  .openapi({ required: ['where'], description: 'A row to delete.', example: { where: { id: 1 } } })
  .openapi('DeleteBody')

export type DeleteBody = z.infer<typeof DeleteBodySchema>

export const SqlResultSchema = z
  .object({
    columns: z
      .array(z.string())
      .openapi({ description: 'The column names of the result set (empty for a write)' }),
    rows: z
      .array(RowSchema)
      .openapi({
        description: 'The rows of the result set keyed by column name (empty for a write)',
      }),
    rowCount: z.int32().openapi({ description: 'Rows returned, or rows affected for a write' }),
    durationMs: z.float64().openapi({ description: 'Wall time of the statement in milliseconds' }),
  })
  .brand<'SqlResult'>()
  .openapi({
    required: ['columns', 'rows', 'rowCount', 'durationMs'],
    description: 'What a statement returned.',
    example: {
      columns: ['id', 'email'],
      rows: [{ id: 1, email: 'ann@example.com' }],
      rowCount: 1,
      durationMs: 0.4,
    },
  })
  .openapi('SqlResult')

export type SqlResult = z.infer<typeof SqlResultSchema>

export const SqlSchema = z
  .string({ error: 'SQL must be a string' })
  .trim()
  .min(1, { error: 'SQL must not be empty' })
  .brand<'Sql'>()
  .openapi({
    description:
      'One SQL statement, run as written (the Studio API is loopback-only; there is no sandbox).',
  })
  .openapi('Sql')

export type Sql = z.infer<typeof SqlSchema>

export const SqlBodySchema = z
  .object({ sql: SqlSchema.openapi({ description: 'The statement' }) })
  .openapi({
    required: ['sql'],
    description: 'A statement to run.',
    example: { sql: 'SELECT id, email FROM users LIMIT 10' },
  })
  .openapi('SqlBody')

export type SqlBody = z.infer<typeof SqlBodySchema>

export const FormattedSchema = z
  .object({
    text: z.string().openapi({ description: 'The text as the Prisma formatter lays it out' }),
  })
  .brand<'Formatted'>()
  .openapi({
    required: ['text'],
    description: 'Formatted schema text.',
    example: { text: 'model User {\n  id Int @id\n}\n' },
  })
  .openapi('Formatted')

export type Formatted = z.infer<typeof FormattedSchema>

export const TextBodySchema = z
  .object({ text: SchemaTextSchema.openapi({ description: 'The text as typed' }) })
  .openapi({
    required: ['text'],
    description: 'Schema text to format.',
    example: { text: 'model User {\nid Int @id\n}\n' },
  })
  .openapi('TextBody')

export type TextBody = z.infer<typeof TextBodySchema>

export const SeveritySchema = z
  .enum(['error', 'warning'])
  .openapi({ description: 'How serious a Prisma diagnostic is.' })
  .openapi('Severity')

export type Severity = z.infer<typeof SeveritySchema>

export const DiagnosticSchema = z
  .object({
    from: z.int32().openapi({ description: 'Start offset (inclusive)' }),
    to: z.int32().openapi({ description: 'End offset (exclusive)' }),
    message: z.string().openapi({ description: 'The Prisma message' }),
    severity: SeveritySchema.openapi({ description: 'How serious it is' }),
  })
  .openapi({
    required: ['from', 'to', 'message', 'severity'],
    description: 'One Prisma diagnostic, positioned by string offsets into the text.',
    example: {
      from: 19,
      to: 23,
      message:
        'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
      severity: 'error',
    },
  })
  .openapi('Diagnostic')

export type Diagnostic = z.infer<typeof DiagnosticSchema>

export const DiagnosticsSchema = z
  .object({
    diagnostics: z
      .array(DiagnosticSchema)
      .openapi({ description: 'Every diagnostic Prisma reported for the file' }),
  })
  .brand<'Diagnostics'>()
  .openapi({
    required: ['diagnostics'],
    description: 'The diagnostics of one file.',
    example: { diagnostics: [] },
  })
  .openapi('Diagnostics')

export type Diagnostics = z.infer<typeof DiagnosticsSchema>

export const LintBodySchema = z
  .object({
    path: SchemaFilePathSchema.openapi({ description: 'The loaded file the text replaces' }),
    text: SchemaTextSchema.openapi({ description: 'The text being edited' }),
  })
  .openapi({
    required: ['path', 'text'],
    description: 'The buffer being edited, validated together with the other loaded files.',
    example: { path: 'prisma/schema.prisma', text: 'model User {\n  id Nope @id\n}\n' },
  })
  .openapi('LintBody')

export type LintBody = z.infer<typeof LintBodySchema>

export const CompletionSchema = z
  .object({
    label: z.string().openapi({ description: 'What the completion list shows' }),
    detail: z
      .string()
      .nullable()
      .openapi({ description: 'A short type or kind, when the server gives one' }),
    documentation: z
      .string()
      .nullable()
      .openapi({ description: 'The documentation text, when the server gives one' }),
    insertText: z
      .string()
      .openapi({ description: 'The text to insert, with LSP snippet placeholders stripped' }),
  })
  .openapi({
    required: ['label', 'detail', 'documentation', 'insertText'],
    description: 'One completion the Prisma language server offers.',
    example: {
      label: 'postgresql',
      detail: null,
      documentation: 'The PostgreSQL provider',
      insertText: '"postgresql"',
    },
  })
  .openapi('Completion')

export type Completion = z.infer<typeof CompletionSchema>

export const CompletionsSchema = z
  .object({
    items: z
      .array(CompletionSchema)
      .openapi({ description: "The offered completions in the server's order" }),
  })
  .brand<'Completions'>()
  .openapi({ required: ['items'], description: 'The completions at a position.', example: {} })
  .openapi('Completions')

export type Completions = z.infer<typeof CompletionsSchema>

export const LineSchema = z
  .int32()
  .min(0)
  .brand<'Line'>()
  .openapi({
    description: 'A 0-based line number in the editor buffer.',
    'x-minValue-message': 'line must be 0 or more',
  })
  .openapi('Line')

export type Line = z.infer<typeof LineSchema>

export const CharacterSchema = z
  .int32()
  .min(0)
  .brand<'Character'>()
  .openapi({
    description: 'A 0-based column (UTF-16 code unit offset) in the editor buffer.',
    'x-minValue-message': 'character must be 0 or more',
  })
  .openapi('Character')

export type Character = z.infer<typeof CharacterSchema>

export const CompleteBodySchema = z
  .object({
    text: SchemaTextSchema.openapi({ description: 'The text as typed' }),
    line: LineSchema.openapi({ description: 'The cursor line' }),
    character: CharacterSchema.openapi({ description: 'The cursor column' }),
  })
  .openapi({
    required: ['text', 'line', 'character'],
    description: 'A completion request at a cursor position.',
    example: { text: 'datasource db {\n  provider = \n}\n', line: 1, character: 13 },
  })
  .openapi('CompleteBody')

export type CompleteBody = z.infer<typeof CompleteBodySchema>

export const DocsDirectiveSchema = z
  .object({
    name: z.string().openapi({ description: 'The attribute name' }),
    values: z.array(z.string()).openapi({ description: 'The field names the attribute lists' }),
  })
  .openapi({
    required: ['name', 'values'],
    description:
      'A model-level attribute (`@@id`, `@@unique`, `@@index`) and the fields it covers.',
    example: { name: '@@unique', values: ['email'] },
  })
  .openapi('DocsDirective')

export type DocsDirective = z.infer<typeof DocsDirectiveSchema>

export const DocsFieldSchema = z
  .object({
    name: z.string().openapi({ description: 'The field name' }),
    type: z
      .string()
      .openapi({ description: 'The type as written, with `?` for optional and `[]` for lists' }),
    bareTypeName: z
      .string()
      .openapi({ description: 'The type name without modifiers, used to link to the output type' }),
    directives: z
      .array(z.string())
      .openapi({
        description: 'The field attributes (`@id`, `@unique`, `@default(...)`, `@updatedAt`)',
      }),
    documentation: z.string().nullable().openapi({ description: 'The `///` doc comment' }),
    required: z.boolean().openapi({ description: 'Whether the field is required' }),
  })
  .openapi({
    required: ['name', 'type', 'bareTypeName', 'directives', 'documentation', 'required'],
    description: 'One field of a model, as the documentation shows it.',
    example: {
      name: 'email',
      type: 'String',
      bareTypeName: 'String',
      directives: ['@unique'],
      documentation: 'Sign-in address',
      required: true,
    },
  })
  .openapi('DocsField')

export type DocsField = z.infer<typeof DocsFieldSchema>

export const DocsTypeRefSchema = z
  .object({
    type: z
      .string()
      .openapi({ description: 'The type name: a scalar, an input type or an output type' }),
    isList: z.boolean().openapi({ description: 'Whether the reference is a list of that type' }),
  })
  .openapi({
    required: ['type', 'isList'],
    description: 'A reference to a type in the Prisma client API.',
    example: { type: 'UserWhereInput', isList: false },
  })
  .openapi('DocsTypeRef')

export type DocsTypeRef = z.infer<typeof DocsTypeRefSchema>

export const DocsOperationInputSchema = z
  .object({
    name: z.string().openapi({ description: 'The argument name' }),
    types: z.array(DocsTypeRefSchema).openapi({ description: 'The accepted types' }),
    required: z.boolean().openapi({ description: 'Whether the argument is required' }),
  })
  .openapi({
    required: ['name', 'types', 'required'],
    description: 'One argument of a Prisma client operation.',
    example: {
      name: 'where',
      types: [{ type: 'UserWhereUniqueInput', isList: false }],
      required: true,
    },
  })
  .openapi('DocsOperationInput')

export type DocsOperationInput = z.infer<typeof DocsOperationInputSchema>

export const DocsOperationOutputSchema = z
  .object({
    type: z
      .string()
      .nullable()
      .openapi({ description: 'The output type name, when the client API declares the operation' }),
    required: z.boolean().openapi({ description: 'Whether the result is non-null' }),
    list: z.boolean().openapi({ description: 'Whether the result is a list' }),
  })
  .openapi({
    required: ['type', 'required', 'list'],
    description: 'What a Prisma client operation returns.',
    example: { type: 'User', required: true, list: false },
  })
  .openapi('DocsOperationOutput')

export type DocsOperationOutput = z.infer<typeof DocsOperationOutputSchema>

export const DocsOperationSchema = z
  .object({
    name: z.string().openapi({ description: 'The operation name' }),
    description: z.string().openapi({ description: 'What the operation does' }),
    usage: z.string().openapi({ description: 'A usage snippet with the Prisma client' }),
    inputs: z
      .array(DocsOperationInputSchema)
      .nullable()
      .openapi({ description: 'The arguments, when the client API declares the operation' }),
    output: DocsOperationOutputSchema.openapi({ description: 'The result' }),
  })
  .openapi({
    required: ['name', 'description', 'usage', 'inputs', 'output'],
    description: 'One Prisma client operation of a model (`findMany`, `create`, ...).',
    example: {
      name: 'findUnique',
      description: 'Find zero or one User',
      usage:
        '// Get one User\nconst user = await prisma.user.findUnique({\n  where: {\n    // ... provide filter here\n  }\n})',
      inputs: [
        { name: 'where', types: [{ type: 'UserWhereUniqueInput', isList: false }], required: true },
      ],
      output: { type: 'User', required: false, list: false },
    },
  })
  .openapi('DocsOperation')

export type DocsOperation = z.infer<typeof DocsOperationSchema>

export const DocsModelSchema = z
  .object({
    name: z.string().openapi({ description: 'The model name' }),
    documentation: z.string().nullable().openapi({ description: 'The `///` doc comment' }),
    directives: z.array(DocsDirectiveSchema).openapi({ description: 'The model-level attributes' }),
    fields: z.array(DocsFieldSchema).openapi({ description: 'The fields in declaration order' }),
    operations: z
      .array(DocsOperationSchema)
      .openapi({ description: 'The Prisma client operations of the model' }),
  })
  .openapi({
    required: ['name', 'documentation', 'directives', 'fields', 'operations'],
    description: 'One model of the documentation.',
    example: {
      name: 'User',
      documentation: 'A registered account',
      directives: [{ name: '@@unique', values: ['email'] }],
      fields: [],
      operations: [],
    },
  })
  .openapi('DocsModel')

export type DocsModel = z.infer<typeof DocsModelSchema>

export const DocsTypeFieldSchema = z
  .object({
    name: z.string().openapi({ description: 'The field name' }),
    types: z.array(DocsTypeRefSchema).openapi({ description: 'The accepted types' }),
    nullable: z
      .boolean()
      .openapi({
        description:
          'Whether the field may be null (input types), or is non-null (output types), as the original page shows it',
      }),
  })
  .openapi({
    required: ['name', 'types', 'nullable'],
    description: 'One field of an input or output type of the Prisma client API.',
    example: { name: 'email', types: [{ type: 'String', isList: false }], nullable: false },
  })
  .openapi('DocsTypeField')

export type DocsTypeField = z.infer<typeof DocsTypeFieldSchema>

export const DocsTypeSchema = z
  .object({
    name: z.string().openapi({ description: 'The type name' }),
    fields: z
      .array(DocsTypeFieldSchema)
      .openapi({ description: 'The fields in declaration order' }),
  })
  .openapi({
    required: ['name', 'fields'],
    description: 'One input or output type of the Prisma client API.',
    example: { name: 'UserWhereInput', fields: [] },
  })
  .openapi('DocsType')

export type DocsType = z.infer<typeof DocsTypeSchema>

export const DocsSchema = z
  .object({
    models: z.array(DocsModelSchema).openapi({ description: 'Every model in declaration order' }),
    inputTypes: z
      .array(DocsTypeSchema)
      .openapi({ description: 'The input types of the Prisma client API' }),
    outputTypes: z
      .array(DocsTypeSchema)
      .openapi({
        description: 'The output types: the model types, then the aggregate / payload types',
      }),
  })
  .brand<'Docs'>()
  .openapi({
    required: ['models', 'inputTypes', 'outputTypes'],
    description:
      'Everything the documentation page shows: the models with their operations, then the client API types.',
    example: { models: [], inputTypes: [], outputTypes: [] },
  })
  .openapi('Docs')

export type Docs = z.infer<typeof DocsSchema>

const RowsQuerySkipParamsSchema = SkipSchema.openapi({
  param: {
    name: 'skip',
    in: 'query',
    required: true,
    description: 'Rows to skip before the page',
    schema: { $ref: '#/components/schemas/skip' },
    explode: false,
  },
})

const RowsQueryTakeParamsSchema = TakeSchema.openapi({
  param: {
    name: 'take',
    in: 'query',
    required: true,
    description: 'Rows per page',
    schema: { $ref: '#/components/schemas/take' },
    explode: false,
  },
})

const RowsQuerySearchParamsSchema = SearchSchema.exactOptional().openapi({
  param: {
    name: 'search',
    in: 'query',
    required: false,
    description: 'Text every returned row must contain',
    schema: { $ref: '#/components/schemas/search' },
    explode: false,
  },
})

export const getSchemaRoute = createRoute({
  method: 'get',
  path: '/schema',
  tags: ['schema'],
  description:
    'The current snapshot: the last valid schema, the current Prisma error and the files on disk.',
  operationId: 'readSchema',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: SnapshotSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const postSchemaReloadRoute = createRoute({
  method: 'post',
  path: '/schema/reload',
  tags: ['schema'],
  description:
    'Re-read and re-parse the schema from disk (the watcher does this on its own after every save).',
  operationId: 'reloadSchema',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: SnapshotSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const putSchemaFilesRoute = createRoute({
  method: 'put',
  path: '/schema/files',
  tags: ['schema'],
  description:
    'Write one schema file back to disk and reload, so the returned snapshot reflects the edit.\nOnly a path listed in `Snapshot.files` can be written (404 otherwise); a file the OS refuses\nto write is reported as a validation problem on `path`.',
  operationId: 'writeSchemaFile',
  request: {
    body: { content: { 'application/json': { schema: FileWriteSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: SnapshotSchema } },
    },
    404: {
      description: '404 Not Found (`application/problem+json`)',
      content: { 'application/problem+json': { schema: NotFoundProblemSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const getSchemaEventsRoute = createRoute({
  method: 'get',
  path: '/schema/events',
  tags: ['schema'],
  description:
    'Server-sent events: `ready` (data: the current `updatedAt`) on connect, `change` (data: the\nnew `updatedAt`) after every reload, and `ping` every 15 seconds to keep the connection open.',
  operationId: 'readSchemaEvents',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'text/event-stream': { schema: z.string() } },
    },
  },
})

export const getDbRoute = createRoute({
  method: 'get',
  path: '/db',
  tags: ['db'],
  description: 'The database connection status.',
  operationId: 'readDbStatus',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: DbStatusSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const getDbCountsRoute = createRoute({
  method: 'get',
  path: '/db/counts',
  tags: ['db'],
  description: 'Row count of every model that has a table; a model whose count fails is left out.',
  operationId: 'readCounts',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: CountsSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
    503: {
      description: '503 Service Unavailable (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ServiceUnavailableProblemSchema } },
    },
  },
})

export const getDbRowsModelNameRoute = createRoute({
  method: 'get',
  path: '/db/rows/{modelName}',
  tags: ['db'],
  description: "One page of a model's rows, keyed by field name, ordered by the key fields.",
  operationId: 'readRows',
  request: {
    params: z.object({
      modelName: ModelNameSchema.openapi({
        param: {
          name: 'modelName',
          in: 'path',
          required: true,
          schema: { $ref: '#/components/schemas/modelName' },
        },
      }),
    }),
    query: z.object({
      skip: RowsQuerySkipParamsSchema,
      take: RowsQueryTakeParamsSchema,
      search: RowsQuerySearchParamsSchema,
    }),
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: RowsSchema } },
    },
    404: {
      description: '404 Not Found (`application/problem+json`)',
      content: { 'application/problem+json': { schema: NotFoundProblemSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
    503: {
      description: '503 Service Unavailable (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ServiceUnavailableProblemSchema } },
    },
  },
})

export const postDbRowsModelNameRoute = createRoute({
  method: 'post',
  path: '/db/rows/{modelName}',
  tags: ['db'],
  description:
    "Insert one row; field names are translated to columns and values to the driver's representation.",
  operationId: 'createRow',
  request: {
    params: z.object({
      modelName: ModelNameSchema.openapi({
        param: {
          name: 'modelName',
          in: 'path',
          required: true,
          schema: { $ref: '#/components/schemas/modelName' },
        },
      }),
    }),
    body: { content: { 'application/json': { schema: InsertBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: AffectedSchema } },
    },
    404: {
      description: '404 Not Found (`application/problem+json`)',
      content: { 'application/problem+json': { schema: NotFoundProblemSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
    503: {
      description: '503 Service Unavailable (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ServiceUnavailableProblemSchema } },
    },
  },
})

export const deleteDbRowsModelNameRoute = createRoute({
  method: 'delete',
  path: '/db/rows/{modelName}',
  tags: ['db'],
  description: 'Delete the row identified by `where`.',
  operationId: 'deleteRow',
  request: {
    params: z.object({
      modelName: ModelNameSchema.openapi({
        param: {
          name: 'modelName',
          in: 'path',
          required: true,
          schema: { $ref: '#/components/schemas/modelName' },
        },
      }),
    }),
    body: { content: { 'application/json': { schema: DeleteBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: AffectedSchema } },
    },
    404: {
      description: '404 Not Found (`application/problem+json`)',
      content: { 'application/problem+json': { schema: NotFoundProblemSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
    503: {
      description: '503 Service Unavailable (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ServiceUnavailableProblemSchema } },
    },
  },
})

export const patchDbRowsModelNameRoute = createRoute({
  method: 'patch',
  path: '/db/rows/{modelName}',
  tags: ['db'],
  description: 'Update the row identified by `where`; both parts must name at least one field.',
  operationId: 'updateRow',
  request: {
    params: z.object({
      modelName: ModelNameSchema.openapi({
        param: {
          name: 'modelName',
          in: 'path',
          required: true,
          schema: { $ref: '#/components/schemas/modelName' },
        },
      }),
    }),
    body: { content: { 'application/json': { schema: UpdateBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: AffectedSchema } },
    },
    404: {
      description: '404 Not Found (`application/problem+json`)',
      content: { 'application/problem+json': { schema: NotFoundProblemSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
    503: {
      description: '503 Service Unavailable (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ServiceUnavailableProblemSchema } },
    },
  },
})

export const postDbSqlRoute = createRoute({
  method: 'post',
  path: '/db/sql',
  tags: ['db'],
  description:
    'Run one statement and return its rows, or the affected count for a write, with the wall time.',
  operationId: 'runSql',
  request: { body: { content: { 'application/json': { schema: SqlBodySchema } }, required: true } },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: SqlResultSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
    503: {
      description: '503 Service Unavailable (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ServiceUnavailableProblemSchema } },
    },
  },
})

export const postPrismaFormatRoute = createRoute({
  method: 'post',
  path: '/prisma/format',
  tags: ['prisma'],
  description: 'Format schema text with the Prisma formatter.',
  operationId: 'formatSchemaText',
  request: {
    body: { content: { 'application/json': { schema: TextBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: FormattedSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const postPrismaLintRoute = createRoute({
  method: 'post',
  path: '/prisma/lint',
  tags: ['prisma'],
  description:
    'Validate the buffer together with the other loaded files and return its diagnostics.',
  operationId: 'lintSchemaText',
  request: {
    body: { content: { 'application/json': { schema: LintBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: DiagnosticsSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const postPrismaCompleteRoute = createRoute({
  method: 'post',
  path: '/prisma/complete',
  tags: ['prisma'],
  description: 'Completions the Prisma language server offers at a cursor position.',
  operationId: 'completeSchemaText',
  request: {
    body: { content: { 'application/json': { schema: CompleteBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: CompletionsSchema } },
    },
    422: {
      description: '422 Unprocessable Content (`application/problem+json`)',
      content: { 'application/problem+json': { schema: ValidationProblemSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const getDocsRoute = createRoute({
  method: 'get',
  path: '/docs',
  tags: ['docs'],
  description:
    'The documentation of the last schema that parsed: models, operations and client API types.',
  operationId: 'readDocs',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: DocsSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})
