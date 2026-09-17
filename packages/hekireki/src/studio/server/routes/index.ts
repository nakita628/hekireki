import { createRoute, z } from '@hono/zod-openapi'

export const StatementKindSchema = z
  .enum(['select', 'insert', 'update', 'delete', 'other', 'invalid'])
  .openapi({ description: 'What kind of statement was analyzed.' })
  .openapi('StatementKind')

export const TextRangeSchema = z
  .object({
    start: z.int32().openapi({ description: 'The first character' }),
    end: z.int32().openapi({ description: 'One past the last character' }),
  })
  .openapi({
    required: ['start', 'end'],
    description: 'Character offsets into the statement text, end exclusive.',
    example: { start: 7, end: 12 },
  })
  .openapi('TextRange')

export const NodeKindSchema = z
  .enum([
    'table',
    'cte',
    'subquery',
    'values',
    'function',
    'join',
    'filter',
    'aggregate',
    'having',
    'project',
    'distinct',
    'sort',
    'limit',
    'union',
    'insert',
    'update',
    'delete',
    'returning',
  ])
  .openapi({ description: 'What a node of the data-flow graph stands for.' })
  .openapi('NodeKind')

export const NodeColumnSchema = z
  .object({
    name: z.string().openapi({ description: 'The column name' }),
    dataType: z.string().nullable().openapi({ description: 'The declared type, when known' }),
    used: z
      .boolean()
      .openapi({
        description:
          'Whether the statement reads the column (for a table), or always true for a result',
      }),
  })
  .openapi({
    required: ['name', 'dataType', 'used'],
    description: 'A column a node produces.',
    example: { name: 'email', dataType: 'TEXT', used: true },
  })
  .openapi('NodeColumn')

export const GraphNodeSchema = z
  .object({
    id: z.string().openapi({ description: 'The node id, unique within the statement' }),
    kind: NodeKindSchema.openapi({ description: 'What the node stands for' }),
    label: z.string().openapi({ description: 'The caption (`users AS u`, `LEFT JOIN`, `WHERE`)' }),
    details: z
      .array(z.string())
      .openapi({
        description: 'Lines under the caption: the condition, the grouped keys, the column names',
      }),
    range: TextRangeSchema.nullable().openapi({
      description: "Where the node's clause sits in the text, when it has one",
    }),
    scope: z
      .string()
      .openapi({ description: '`main`, or the CTE / subquery alias the node belongs to' }),
    columns: z
      .array(NodeColumnSchema)
      .openapi({
        description: 'The columns the node produces (tables, CTEs, subqueries and projections)',
      }),
  })
  .openapi({
    required: ['id', 'kind', 'label', 'details', 'range', 'scope', 'columns'],
    description: 'A node of the data-flow graph.',
    example: {
      id: 'n3',
      kind: 'filter',
      label: 'WHERE',
      details: ['u.id = ?'],
      range: { start: 40, end: 48 },
      scope: 'main',
      columns: [],
    },
  })
  .openapi('GraphNode')

export const EdgeKindSchema = z
  .enum(['flow', 'lookup'])
  .openapi({ description: 'How rows travel along an edge.' })
  .openapi('EdgeKind')

export const GraphEdgeSchema = z
  .object({
    id: z.string().openapi({ description: 'The edge id, unique within the statement' }),
    source: z.string().openapi({ description: 'The node rows come from' }),
    target: z.string().openapi({ description: 'The node rows go to' }),
    label: z
      .string()
      .nullable()
      .openapi({
        description:
          'A caption (`optional` for the outer side of a join, `scalar` for a scalar subquery)',
      }),
    kind: EdgeKindSchema.openapi({ description: 'How rows travel' }),
  })
  .openapi({
    required: ['id', 'source', 'target', 'label', 'kind'],
    description: 'An edge of the data-flow graph.',
    example: { id: 'n1->n3:0', source: 'n1', target: 'n3', label: null, kind: 'flow' },
  })
  .openapi('GraphEdge')

export const TableRefSchema = z
  .object({
    nodeId: z.string().openapi({ description: 'The graph node of this reference' }),
    name: z.string().openapi({ description: 'The table name as written' }),
    alias: z.string().nullable().openapi({ description: 'The alias, when one was given' }),
    scope: z
      .string()
      .openapi({ description: '`main`, or the CTE / subquery alias the reference sits in' }),
    known: z.boolean().openapi({ description: 'Whether the schema has the table' }),
    columnsUsed: z
      .array(z.string())
      .openapi({ description: 'The columns the statement reads from this reference' }),
    range: TextRangeSchema.openapi({ description: 'Where the name sits in the text' }),
  })
  .openapi({
    required: ['nodeId', 'name', 'alias', 'scope', 'known', 'columnsUsed', 'range'],
    description: 'A table the statement reads or writes.',
    example: {
      nodeId: 'n1',
      name: 'users',
      alias: 'u',
      scope: 'main',
      known: true,
      columnsUsed: ['id', 'email'],
      range: { start: 20, end: 25 },
    },
  })
  .openapi('TableRef')

export const ColumnSourceSchema = z
  .object({
    table: z.string().openapi({ description: 'The base table' }),
    column: z.string().openapi({ description: 'The column of that table' }),
  })
  .openapi({
    required: ['table', 'column'],
    description: 'A base-table column an output column derives from.',
    example: { table: 'users', column: 'email' },
  })
  .openapi('ColumnSource')

export const OutputColumnSchema = z
  .object({
    name: z.string().openapi({ description: 'The name a driver keys the row with' }),
    expression: z.string().openapi({ description: 'The expression as written' }),
    dataType: z.string().nullable().openapi({ description: 'The declared type, when known' }),
    tsType: z.string().openapi({ description: 'The TypeScript type of the value' }),
    nullable: z
      .boolean()
      .nullable()
      .openapi({ description: 'Whether NULL can come back; null when the analysis cannot tell' }),
    sources: z
      .array(ColumnSourceSchema)
      .openapi({ description: 'The base-table columns the value derives from' }),
  })
  .openapi({
    required: ['name', 'expression', 'dataType', 'tsType', 'nullable', 'sources'],
    description: 'A column of the result, with its lineage and type.',
    example: {
      name: 'email',
      expression: 'u.email',
      dataType: 'TEXT',
      tsType: 'string',
      nullable: true,
      sources: [{ table: 'users', column: 'email' }],
    },
  })
  .openapi('OutputColumn')

export const SqlParameterSchema = z
  .object({
    index: z.int32().openapi({ description: 'The bind position (1-based), or the `$n` number' }),
    placeholder: z
      .string()
      .openapi({ description: 'The placeholder as written (`?`, `$1`, `:name`)' }),
    dataType: z
      .string()
      .nullable()
      .openapi({ description: 'The declared type of the column it is compared with, when known' }),
    tsType: z.string().openapi({ description: 'The TypeScript type a value should have' }),
    nullable: z
      .boolean()
      .nullable()
      .openapi({
        description: 'Whether NULL is a valid value; null when the analysis cannot tell',
      }),
    context: z.string().openapi({ description: 'The expression the placeholder sits in' }),
  })
  .openapi({
    required: ['index', 'placeholder', 'dataType', 'tsType', 'nullable', 'context'],
    description: 'A placeholder and the type of what it stands beside.',
    example: {
      index: 1,
      placeholder: '?',
      dataType: 'INTEGER',
      tsType: 'number',
      nullable: false,
      context: 'u.id = ?',
    },
  })
  .openapi('SqlParameter')

export const SqlSeveritySchema = z
  .enum(['error', 'warning', 'info'])
  .openapi({ description: 'How serious a problem the analysis found is.' })
  .openapi('SqlSeverity')

export const SqlDiagnosticSchema = z
  .object({
    severity: SqlSeveritySchema.openapi({ description: 'How serious it is' }),
    message: z.string().openapi({ description: 'What is wrong' }),
    range: TextRangeSchema.nullable().openapi({
      description: 'Where, when the analysis can point at it',
    }),
  })
  .openapi({
    required: ['severity', 'message', 'range'],
    description: 'A problem found in the statement.',
    example: {
      severity: 'warning',
      message: 'Unknown column "nmae"',
      range: { start: 7, end: 11 },
    },
  })
  .openapi('SqlDiagnostic')

export const StatementAnalysisSchema = z
  .object({
    kind: StatementKindSchema.openapi({ description: 'What kind of statement it is' }),
    text: z.string().openapi({ description: 'The statement text' }),
    range: TextRangeSchema.openapi({
      description: 'Where the statement sits in the submitted text',
    }),
    nodes: z.array(GraphNodeSchema).openapi({ description: 'The nodes of the data-flow graph' }),
    edges: z.array(GraphEdgeSchema).openapi({ description: 'The edges of the data-flow graph' }),
    tables: z.array(TableRefSchema).openapi({ description: 'Every table the statement touches' }),
    columns: z
      .array(OutputColumnSchema)
      .openapi({ description: 'The columns of the result (empty for a write without RETURNING)' }),
    parameters: z
      .array(SqlParameterSchema)
      .openapi({ description: 'The placeholders, in bind order' }),
    diagnostics: z.array(SqlDiagnosticSchema).openapi({ description: 'What was found wrong' }),
    rowType: z
      .string()
      .openapi({
        description: 'The row type as TypeScript (`{ id: number; email: string | null }`)',
      }),
    paramsType: z
      .string()
      .openapi({
        description: 'The parameter tuple (or object, for named placeholders) as TypeScript',
      }),
  })
  .openapi({
    required: [
      'kind',
      'text',
      'range',
      'nodes',
      'edges',
      'tables',
      'columns',
      'parameters',
      'diagnostics',
      'rowType',
      'paramsType',
    ],
    description: 'The analysis of one statement.',
  })
  .openapi('StatementAnalysis')

type AnalysisType = { statements: z.infer<typeof StatementAnalysisSchema>[] }

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

export const FieldKindSchema = z
  .enum(['scalar', 'object', 'enum', 'unsupported'])
  .openapi({ description: 'What a field holds, as Prisma classifies it.' })
  .openapi('FieldKind')

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

export const IndexTypeSchema = z
  .enum(['id', 'unique', 'normal', 'fulltext'])
  .openapi({ description: 'The kind of index a `@@` attribute declares.' })
  .openapi('IndexType')

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

export const RelationOriginSchema = z
  .enum(['inferred', 'annotated', 'implicit-many-to-many'])
  .openapi({ description: 'Where a relation came from.' })
  .openapi('RelationOrigin')

export const CardinalitySchema = z
  .enum(['zero-one', 'one', 'zero-many', 'many'])
  .openapi({ description: 'How many rows one end of a relation points at.' })
  .openapi('Cardinality')

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

export const LineSchema = z
  .int32()
  .min(0)
  .brand<'Line'>()
  .openapi({
    description: 'A 0-based line number in the editor buffer.',
    'x-minValue-message': 'line must be 0 or more',
  })
  .openapi('Line')

export const CharacterSchema = z
  .int32()
  .min(0)
  .brand<'Character'>()
  .openapi({
    description: 'A 0-based column (UTF-16 code unit offset) in the editor buffer.',
    'x-minValue-message': 'character must be 0 or more',
  })
  .openapi('Character')

export const LspPositionSchema = z
  .object({
    line: LineSchema.openapi({ description: 'The line' }),
    character: CharacterSchema.openapi({ description: 'The column' }),
  })
  .openapi({
    required: ['line', 'character'],
    description: 'A 0-based position in a document, as LSP counts it.',
    example: { line: 4, character: 6 },
  })
  .openapi('LspPosition')

export const LspRangeSchema = z
  .object({
    start: LspPositionSchema.openapi({ description: 'Where the range starts' }),
    end: LspPositionSchema.openapi({ description: 'Where the range ends' }),
  })
  .openapi({
    required: ['start', 'end'],
    description: 'A range between two positions, end exclusive.',
    example: { start: { line: 4, character: 6 }, end: { line: 4, character: 10 } },
  })
  .openapi('LspRange')

export const SeveritySchema = z
  .enum(['error', 'warning', 'information', 'hint'])
  .openapi({
    description:
      'How serious a diagnostic of the Prisma language server is (LSP `DiagnosticSeverity`).',
  })
  .openapi('Severity')

export const FileDiagnosticSchema = z
  .object({
    path: z.string().openapi({ description: 'The file, as Studio loaded it' }),
    range: LspRangeSchema.openapi({ description: 'Where it is (0-based, end exclusive)' }),
    message: z.string().openapi({ description: 'The Prisma message' }),
    severity: SeveritySchema.openapi({ description: 'How serious it is' }),
  })
  .openapi({
    required: ['path', 'range', 'message', 'severity'],
    description: 'One diagnostic the Prisma language server reports for a file on disk.',
    example: {
      path: 'prisma/schema.prisma',
      range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } },
      message:
        'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
      severity: 'error',
    },
  })
  .openapi('FileDiagnostic')

export const SnapshotSchema = z
  .object({
    schema: SchemaSchema.nullable().openapi({
      description: 'The last schema that parsed, or null before the first successful parse',
    }),
    error: z
      .string()
      .nullable()
      .openapi({
        description:
          'The Prisma error of the latest parse as the engine printed it, or null when it succeeded',
      }),
    diagnostics: z
      .array(FileDiagnosticSchema)
      .openapi({
        description:
          'Every diagnostic the language server reports for the files on disk; empty when they parse',
      }),
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
    required: ['schema', 'error', 'diagnostics', 'updatedAt', 'files'],
    description:
      'The latest parse result. `schema` is the last schema that parsed (null until one does),\n`error` the current Prisma error and `diagnostics` the same errors as the language server\nplaces them, so a broken edit never blanks the UI. `files` always reflects the disk, even\nwhile the schema is broken.',
    example: {
      schema: null,
      error:
        'error: Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
      diagnostics: [
        {
          path: 'prisma/schema.prisma',
          range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } },
          message:
            'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
          severity: 'error',
        },
      ],
      updatedAt: '2026-09-02T00:00:00.000Z',
      files: [{ path: 'prisma/schema.prisma', content: 'model User {\n  id Nope @id\n}\n' }],
    },
  })
  .openapi('Snapshot')

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

export const SchemaFilePathSchema = z
  .string({ error: 'Path must be a non-empty string' })
  .min(1, { error: 'Path must not be empty' })
  .brand<'SchemaFilePath'>()
  .openapi({
    description:
      'A schema file path exactly as Studio loaded it (relative to the working directory, or absolute\nwhen the schema lives outside it). Only the loaded files can be written back.',
  })
  .openapi('SchemaFilePath')

export const SchemaTextSchema = z
  .string({ error: 'Schema text must be a string' })
  .brand<'SchemaText'>()
  .openapi({
    description: 'Prisma schema source text (a whole file, or the editor buffer being typed).',
  })
  .openapi('SchemaText')

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

export const DialectSchema = z
  .enum(['postgresql', 'mysql', 'sqlite'])
  .openapi({ description: 'The SQL dialect of the connected database.' })
  .openapi('Dialect')

export const UrlSourceSchema = z
  .enum(['flag', 'hekireki', 'prisma', 'env'])
  .openapi({ description: 'Where the database URL was found, in precedence order.' })
  .openapi('UrlSource')

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

export const RowSchema = z
  .record(z.string(), z.union([z.string(), z.float64(), z.boolean()]).nullable())
  .openapi({
    description:
      'One row keyed by Prisma field name (not column name). Values are what JSON can carry: dates\nare ISO strings, bigints are strings, JSON columns are strings.',
    example: { id: 1, email: 'ann@example.com', active: true, deletedAt: null },
  })
  .openapi('Row')

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

export const AffectedSchema = z
  .object({ affected: z.int32().openapi({ description: "The driver's affected-row count" }) })
  .brand<'Affected'>()
  .openapi({
    required: ['affected'],
    description: 'How many rows a write touched.',
    example: { affected: 1 },
  })
  .openapi('Affected')

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

export const DeleteBodySchema = z
  .object({ where: RowSchema.openapi({ description: 'The key fields of the row to delete' }) })
  .openapi({ required: ['where'], description: 'A row to delete.', example: { where: { id: 1 } } })
  .openapi('DeleteBody')

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

export const SqlSchema = z
  .string({ error: 'SQL must be a string' })
  .trim()
  .min(1, { error: 'SQL must not be empty' })
  .brand<'Sql'>()
  .openapi({
    description:
      'SQL text: one or more statements, analyzed or run as written (the Studio API is loopback-only; there is no sandbox).',
  })
  .openapi('Sql')

export const SqlBodySchema = z
  .object({
    sql: SqlSchema.openapi({
      description: 'The statements; several are run one by one and the result belongs to the last',
    }),
    params: z
      .array(z.union([z.string(), z.float64(), z.boolean()]).nullable())
      .exactOptional()
      .openapi({
        description: 'The values bound to the placeholders, in order; omitted means none',
      }),
  })
  .openapi({
    required: ['sql'],
    description: 'A statement to run.',
    example: { sql: 'SELECT id, email FROM users LIMIT 10' },
  })
  .openapi('SqlBody')

export const PlanNodeSchema = z
  .object({
    id: z.string().openapi({ description: 'The step id, unique within the plan' }),
    parent: z
      .string()
      .nullable()
      .openapi({ description: 'The id of the step this one feeds, or null for a root' }),
    label: z
      .string()
      .openapi({
        description: 'What the step does (`SCAN users`, `Seq Scan on users`, `Hash Join`)',
      }),
    detail: z
      .string()
      .nullable()
      .openapi({ description: 'The rest of what the database said about the step' }),
    cost: z
      .float64()
      .nullable()
      .openapi({ description: 'The estimated cost, when the database reports one' }),
    rows: z
      .float64()
      .nullable()
      .openapi({
        description: 'The estimated (or, with ANALYZE, actual) row count, when reported',
      }),
  })
  .openapi({
    required: ['id', 'parent', 'label', 'detail', 'cost', 'rows'],
    description: 'One step of the execution plan, flattened; `parent` rebuilds the tree.',
    example: { id: '3', parent: null, label: 'SCAN users', detail: null, cost: null, rows: null },
  })
  .openapi('PlanNode')

export const PlanSchema = z
  .object({
    dialect: DialectSchema.openapi({ description: 'The dialect that produced the plan' }),
    nodes: z.array(PlanNodeSchema).openapi({ description: 'The steps, parents before children' }),
    raw: z.string().openapi({ description: 'The plan as the database printed it' }),
  })
  .brand<'Plan'>()
  .openapi({
    required: ['dialect', 'nodes', 'raw'],
    description: 'The execution plan of a statement.',
    example: { dialect: 'sqlite', nodes: [], raw: '' },
  })
  .openapi('Plan')

export const AnalysisSchema: z.ZodType<AnalysisType> = z
  .lazy(() =>
    z
      .object({
        statements: z
          .array(StatementAnalysisSchema)
          .openapi({ description: 'One entry per statement, in order' }),
      })
      .brand<'Analysis'>()
      .openapi({
        required: ['statements'],
        description: 'The analysis of every statement in the text.',
      }),
  )
  .openapi('Analysis')

export const AnalyzeBodySchema = z
  .object({ sql: SqlSchema.openapi({ description: 'The statements' }) })
  .openapi({
    required: ['sql'],
    description: 'Text to analyze.',
    example: { sql: 'SELECT id, email FROM users WHERE id = ?' },
  })
  .openapi('AnalyzeBody')

export const ClientStatusSchema = z
  .object({
    available: z
      .boolean()
      .openapi({
        description:
          "Whether the client is loaded and connected through the project's driver adapter",
      }),
    source: z
      .string()
      .nullable()
      .openapi({
        description: 'Where the client was loaded from: the generator output, or `@prisma/client`',
      }),
    error: z
      .string()
      .nullable()
      .openapi({ description: 'Why the client could not be loaded, when it could not' }),
    typescript: z
      .string()
      .nullable()
      .openapi({
        description:
          "The version of the project's TypeScript the editor completes with, or null without one",
      }),
    typesError: z
      .string()
      .nullable()
      .openapi({
        description: "Why the editor cannot complete against the client's types, when it cannot",
      }),
  })
  .brand<'ClientStatus'>()
  .openapi({
    required: ['available', 'source', 'error', 'typescript', 'typesError'],
    description:
      "Whether the project's Prisma Client can be loaded, and whether its types can be read.",
    example: {
      available: true,
      source: 'generated/client',
      error: null,
      typescript: '5.9.3',
      typesError: null,
    },
  })
  .openapi('ClientStatus')

export const ClientCallSchema = z
  .object({
    model: z
      .string()
      .openapi({ description: 'The model the delegate stands for (`prisma.user` → `User`)' }),
    operation: z
      .string()
      .openapi({ description: 'The operation called on it (`findMany`, `create`, ...)' }),
    write: z.boolean().openapi({ description: 'Whether the operation writes' }),
    range: TextRangeSchema.openapi({ description: 'Where the call sits in the text' }),
  })
  .openapi({
    required: ['model', 'operation', 'write', 'range'],
    description: 'One model operation the query makes.',
    example: { model: 'User', operation: 'findMany', write: false, range: { start: 0, end: 22 } },
  })
  .openapi('ClientCall')

export const ClientTouchedModelSchema = z
  .object({
    model: z.string().openapi({ description: 'The model, as the schema declares it' }),
    fields: z
      .array(z.string())
      .openapi({
        description:
          'The fields of the model the arguments name: scalars they filter, select, order or write, relations they follow',
      }),
  })
  .openapi({
    required: ['model', 'fields'],
    description: 'A model the query touches, with the fields its arguments name.',
    example: { model: 'User', fields: ['email', 'posts'] },
  })
  .openapi('ClientTouchedModel')

export const ClientDiagnosticSchema = z
  .object({
    message: z.string().openapi({ description: 'What is wrong' }),
    range: TextRangeSchema.openapi({ description: 'Where' }),
  })
  .openapi({
    required: ['message', 'range'],
    description: 'A problem that keeps the query from being run.',
    example: { message: 'Unknown model delegate "usr"', range: { start: 7, end: 10 } },
  })
  .openapi('ClientDiagnostic')

export const ClientAnalysisSchema = z
  .object({
    calls: z
      .array(ClientCallSchema)
      .openapi({ description: 'The calls, in order (empty when the text does not parse)' }),
    transaction: z
      .boolean()
      .openapi({ description: 'Whether the calls are batched in one `$transaction`' }),
    touched: z
      .array(ClientTouchedModelSchema)
      .openapi({
        description:
          'The models the calls are made on and the ones their relations reach, in the order they are reached',
      }),
    diagnostics: z
      .array(ClientDiagnosticSchema)
      .openapi({ description: 'What keeps the query from being run (empty when it can be)' }),
  })
  .brand<'ClientAnalysis'>()
  .openapi({
    required: ['calls', 'transaction', 'touched', 'diagnostics'],
    description: 'What the query text says, read without running it.',
    example: {
      calls: [{ model: 'User', operation: 'findMany', write: false, range: { start: 0, end: 22 } }],
      transaction: false,
      touched: [{ model: 'User', fields: ['email'] }],
      diagnostics: [],
    },
  })
  .openapi('ClientAnalysis')

export const ClientQuerySchema = z
  .string({ error: 'Query must be a string' })
  .trim()
  .min(1, { error: 'Query must not be empty' })
  .brand<'ClientQuery'>()
  .openapi({
    description:
      'A Prisma Client call as TypeScript would write it (`prisma.user.findMany({ take: 10 })`, or\n`prisma.$transaction([...])` over several). Only literal arguments are read: nothing in it is\nevaluated as code.',
  })
  .openapi('ClientQuery')

export const ClientQueryBodySchema = z
  .object({
    query: ClientQuerySchema.openapi({ description: 'The call, as TypeScript would write it' }),
  })
  .openapi({
    required: ['query'],
    description: 'A Prisma Client call to analyze or run.',
    example: { query: 'prisma.user.findMany({ where: { email: { contains: "ann" } }, take: 10 })' },
  })
  .openapi('ClientQueryBody')

export const ClientCompletionItemSchema = z
  .object({
    label: z.string().openapi({ description: 'What is inserted, and shown' }),
    kind: z
      .string()
      .openapi({
        description: 'The TypeScript element kind (`property`, `method`, `keyword`, ...)',
      }),
    sortText: z.string().openapi({ description: 'The order TypeScript ranks the item in' }),
    insertText: z
      .string()
      .nullable()
      .openapi({
        description: 'The text to insert when it differs from the label (a quoted key), else null',
      }),
  })
  .openapi({
    required: ['label', 'kind', 'sortText', 'insertText'],
    description: 'One completion TypeScript offers at a position.',
    example: { label: 'where', kind: 'property', sortText: '11', insertText: null },
  })
  .openapi('ClientCompletionItem')

export const ClientCompletionsSchema = z
  .object({
    items: z
      .array(ClientCompletionItemSchema)
      .openapi({ description: 'The items, unordered; `sortText` orders them' }),
  })
  .brand<'ClientCompletions'>()
  .openapi({ required: ['items'], description: 'The completions at a position.', example: {} })
  .openapi('ClientCompletions')

export const QueryOffsetSchema = z
  .int32()
  .min(0)
  .brand<'QueryOffset'>()
  .openapi({
    description:
      'A 0-based offset into the query text, in UTF-16 code units, as the editor counts.',
    'x-minValue-message': 'offset must be 0 or more',
  })
  .openapi('QueryOffset')

export const ClientPositionBodySchema = z
  .object({
    query: ClientQuerySchema.openapi({ description: 'The query text as typed so far' }),
    offset: QueryOffsetSchema.openapi({ description: 'Where the cursor is' }),
  })
  .openapi({
    required: ['query', 'offset'],
    description: 'A position in a query, for completion, hovers and signature help.',
    example: { query: 'prisma.user.findMany({ wh', offset: 25 },
  })
  .openapi('ClientPositionBody')

export const ClientCompletionDetailSchema = z
  .object({
    detail: z
      .string()
      .nullable()
      .openapi({ description: "The item's signature as TypeScript prints it" }),
    documentation: z.string().nullable().openapi({ description: 'Its doc comment, as Markdown' }),
  })
  .brand<'ClientCompletionDetail'>()
  .openapi({
    required: ['detail', 'documentation'],
    description: 'The type and the documentation of one completion.',
    example: { detail: '(property) where?: UserWhereInput', documentation: null },
  })
  .openapi('ClientCompletionDetail')

export const ClientCompletionDetailBodySchema = z
  .object({
    query: ClientQuerySchema.openapi({ description: 'The query text as typed so far' }),
    offset: QueryOffsetSchema.openapi({ description: 'Where the cursor is' }),
    name: z.string().openapi({ description: 'The label of the item' }),
  })
  .openapi({
    required: ['query', 'offset', 'name'],
    description: 'One completion to say more about.',
    example: { query: 'prisma.user.findMany({ wh', offset: 25, name: 'where' },
  })
  .openapi('ClientCompletionDetailBody')

export const ClientHoverSchema = z
  .object({
    contents: z
      .string()
      .nullable()
      .openapi({
        description: 'The type and documentation as Markdown, or null when nothing is there',
      }),
    range: TextRangeSchema.nullable().openapi({ description: 'The symbol the hover is about' }),
  })
  .brand<'ClientHover'>()
  .openapi({
    required: ['contents', 'range'],
    description: 'What TypeScript says about the symbol at a position.',
    example: {
      contents: '```typescript\n(property) take?: number\n```',
      range: { start: 22, end: 26 },
    },
  })
  .openapi('ClientHover')

export const ClientSignatureParameterSchema = z
  .object({
    label: z.string().openapi({ description: 'The parameter as TypeScript prints it' }),
    documentation: z.string().nullable().openapi({ description: 'Its doc comment' }),
  })
  .openapi({
    required: ['label', 'documentation'],
    description: 'One parameter of a signature.',
    example: { label: 'args?: UserFindManyArgs', documentation: null },
  })
  .openapi('ClientSignatureParameter')

export const ClientSignatureSchema = z
  .object({
    label: z.string().openapi({ description: 'The whole signature' }),
    documentation: z.string().nullable().openapi({ description: 'Its doc comment' }),
    parameters: z
      .array(ClientSignatureParameterSchema)
      .openapi({ description: 'The parameters, in order' }),
  })
  .openapi({
    required: ['label', 'documentation', 'parameters'],
    description: 'One overload of the call under the cursor.',
    example: {
      label: 'findMany(args?: UserFindManyArgs): PrismaPromise<User[]>',
      documentation: 'Find zero or more Users that matches the filter.',
      parameters: [{ label: 'args?: UserFindManyArgs', documentation: null }],
    },
  })
  .openapi('ClientSignature')

export const ClientSignatureHelpSchema = z
  .object({
    signatures: z
      .array(ClientSignatureSchema)
      .openapi({ description: 'The overloads; empty when the cursor is not inside a call' }),
    activeSignature: z.int32().openapi({ description: 'The overload the arguments so far match' }),
    activeParameter: z.int32().openapi({ description: 'The parameter the cursor is on' }),
  })
  .brand<'ClientSignatureHelp'>()
  .openapi({
    required: ['signatures', 'activeSignature', 'activeParameter'],
    description:
      'The signatures of the call the cursor is inside, and which one and which parameter is active.',
    example: { signatures: [], activeSignature: 0, activeParameter: 0 },
  })
  .openapi('ClientSignatureHelp')

export const ClientFormattedSchema = z
  .object({
    text: z
      .string()
      .openapi({ description: 'The whole text, formatted; the same text when it already is' }),
  })
  .brand<'ClientFormatted'>()
  .openapi({
    required: ['text'],
    description: "The query laid out as the repository's TypeScript formatter (oxfmt) writes it.",
    example: { text: 'prisma.user.findMany({ take: 10 })' },
  })
  .openapi('ClientFormatted')

export const TypeSeveritySchema = z
  .enum(['error', 'warning', 'info'])
  .openapi({ description: 'How serious a TypeScript diagnostic is.' })
  .openapi('TypeSeverity')

export const ClientTypeDiagnosticSchema = z
  .object({
    message: z.string().openapi({ description: 'What is wrong' }),
    severity: TypeSeveritySchema.openapi({ description: 'How serious it is' }),
    range: TextRangeSchema.openapi({ description: 'Where' }),
  })
  .openapi({
    required: ['message', 'severity', 'range'],
    description: 'One problem TypeScript finds in the query.',
    example: {
      message: 'Object literal may only specify known properties.',
      severity: 'error',
      range: { start: 22, end: 26 },
    },
  })
  .openapi('ClientTypeDiagnostic')

export const ClientTypeDiagnosticsSchema = z
  .object({
    diagnostics: z
      .array(ClientTypeDiagnosticSchema)
      .openapi({ description: 'The problems, in order of position' }),
  })
  .brand<'ClientTypeDiagnostics'>()
  .openapi({
    required: ['diagnostics'],
    description: "What TypeScript finds wrong with the query against the client's types.",
    example: { diagnostics: [] },
  })
  .openapi('ClientTypeDiagnostics')

export const ClientSqlQuerySchema = z
  .object({
    sql: z
      .string()
      .openapi({
        description:
          "The statement as the driver received it, from Prisma Client's own query event",
      }),
    formatted: z
      .string()
      .openapi({
        description:
          'The same statement laid out a clause per line for reading: only its whitespace differs',
      }),
    params: z
      .array(z.union([z.string(), z.float64(), z.boolean()]).nullable())
      .openapi({ description: 'The values bound to its placeholders, in order' }),
    durationMs: z.float64().openapi({ description: 'How long the database took, in milliseconds' }),
  })
  .openapi({
    required: ['sql', 'formatted', 'params', 'durationMs'],
    description: 'One SQL statement the Prisma Client sent to the database.',
    example: {
      sql: 'SELECT `main`.`User`.`id` FROM `main`.`User` LIMIT ? OFFSET ?',
      formatted: 'SELECT\n  `main`.`User`.`id`\nFROM `main`.`User`\nLIMIT ?\nOFFSET ?',
      params: ['10', '0'],
      durationMs: 0.4,
    },
  })
  .openapi('ClientSqlQuery')

export const ClientPreviewSchema = z
  .object({
    queries: z
      .array(ClientSqlQuerySchema)
      .openapi({ description: 'The statements the client sent, in order' }),
    durationMs: z.float64().openapi({ description: 'Wall time of the whole call in milliseconds' }),
  })
  .brand<'ClientPreview'>()
  .openapi({
    required: ['queries', 'durationMs'],
    description: 'The SQL a read-only call sends, from running it while it is typed.',
    example: {
      queries: [
        {
          sql: 'SELECT `main`.`User`.`id` FROM `main`.`User` LIMIT ? OFFSET ?',
          formatted: 'SELECT\n  `main`.`User`.`id`\nFROM `main`.`User`\nLIMIT ?\nOFFSET ?',
          params: ['10', '0'],
          durationMs: 0.4,
        },
      ],
      durationMs: 3.2,
    },
  })
  .openapi('ClientPreview')

export const ClientResultSchema = z
  .object({
    result: z
      .any()
      .openapi({
        description:
          'The value the call resolved to, as JSON: dates are ISO strings, bigints and decimals are\nstrings, bytes are base64. A `$transaction` resolves to the array of its results.',
      }),
    rowCount: z
      .int32()
      .nullable()
      .openapi({ description: 'The length of the result, when it is an array' }),
    truncated: z
      .boolean()
      .openapi({ description: 'Whether only the first rows of the array are in `result`' }),
    queries: z
      .array(ClientSqlQuerySchema)
      .openapi({ description: 'The statements the client sent, in order' }),
    durationMs: z.float64().openapi({ description: 'Wall time of the whole call in milliseconds' }),
  })
  .brand<'ClientResult'>()
  .openapi({
    required: ['result', 'rowCount', 'truncated', 'queries', 'durationMs'],
    description: 'What a Prisma Client call returned, with the SQL it took.',
    example: {
      result: [{ id: 1, email: 'ann@example.com' }],
      rowCount: 1,
      truncated: false,
      queries: [
        {
          sql: 'SELECT `main`.`User`.`id` FROM `main`.`User` LIMIT ? OFFSET ?',
          formatted: 'SELECT\n  `main`.`User`.`id`\nFROM `main`.`User`\nLIMIT ?\nOFFSET ?',
          params: ['10', '0'],
          durationMs: 0.4,
        },
      ],
      durationMs: 3.2,
    },
  })
  .openapi('ClientResult')

export const LspTextEditSchema = z
  .object({
    range: LspRangeSchema.openapi({ description: 'What to replace' }),
    newText: z.string().openapi({ description: 'The replacement' }),
  })
  .openapi({
    required: ['range', 'newText'],
    description: 'One replacement in a document.',
    example: {
      range: { start: { line: 4, character: 6 }, end: { line: 4, character: 10 } },
      newText: 'Account',
    },
  })
  .openapi('LspTextEdit')

export const FormattedSchema = z
  .object({
    edits: z
      .array(LspTextEditSchema)
      .openapi({
        description:
          'The replacements that lay the text out as the Prisma formatter does; empty when it already is',
      }),
  })
  .brand<'Formatted'>()
  .openapi({
    required: ['edits'],
    description: 'The edits the Prisma formatter makes; the editor applies them as a minimal diff.',
    example: {
      edits: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 3, character: 0 } },
          newText: 'model User {\n  id Int @id\n}\n',
        },
      ],
    },
  })
  .openapi('Formatted')

export const TextBodySchema = z
  .object({
    text: SchemaTextSchema.openapi({ description: 'The text as typed' }),
    path: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'The file the text belongs to, as Studio loaded it; the first file when omitted',
      }),
  })
  .openapi({
    required: ['text'],
    description:
      'Schema text and, when it belongs to a loaded file, that file, so the other loaded files are seen.',
    example: { text: 'model User {\nid Int @id\n}\n' },
  })
  .openapi('TextBody')

export const LspDiagnosticSchema = z
  .object({
    range: LspRangeSchema.openapi({ description: 'Where it is' }),
    message: z.string().openapi({ description: 'The Prisma message' }),
    severity: SeveritySchema.openapi({ description: 'How serious it is' }),
  })
  .openapi({
    required: ['range', 'message', 'severity'],
    description: 'One diagnostic the Prisma language server reports, positioned as LSP does.',
    example: {
      range: { start: { line: 7, character: 7 }, end: { line: 7, character: 8 } },
      message:
        'Type "R" is neither a built-in type, nor refers to another model, composite type, or enum.',
      severity: 'error',
    },
  })
  .openapi('LspDiagnostic')

export const DiagnosticsSchema = z
  .object({
    diagnostics: z
      .array(LspDiagnosticSchema)
      .openapi({ description: 'Every diagnostic the language server reported for the file' }),
  })
  .brand<'Diagnostics'>()
  .openapi({
    required: ['diagnostics'],
    description: 'The diagnostics of one file.',
    example: { diagnostics: [] },
  })
  .openapi('Diagnostics')

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

export const LspDocumentSymbolSchema = z
  .object({
    name: z.string().openapi({ description: 'The declared name' }),
    kind: z
      .int32()
      .openapi({
        description:
          'The LSP `SymbolKind`: 5 = model or view, 10 = enum, 11 = composite type, 23 = datasource, 12 = generator',
      }),
    range: LspRangeSchema.openapi({ description: 'The whole block' }),
    selectionRange: LspRangeSchema.openapi({ description: 'The name inside the block header' }),
  })
  .openapi({
    required: ['name', 'kind', 'range', 'selectionRange'],
    description: "A block of a schema file, as the language server's document outline lists it.",
    example: {
      name: 'User',
      kind: 5,
      range: { start: { line: 4, character: 0 }, end: { line: 9, character: 1 } },
      selectionRange: { start: { line: 4, character: 6 }, end: { line: 4, character: 10 } },
    },
  })
  .openapi('LspDocumentSymbol')

export const SymbolsSchema = z
  .object({
    symbols: z.array(LspDocumentSymbolSchema).openapi({ description: 'Every block of the text' }),
  })
  .brand<'Symbols'>()
  .openapi({
    required: ['symbols'],
    description: 'The blocks of one file in declaration order, as the editor outline shows them.',
    example: { symbols: [] },
  })
  .openapi('Symbols')

export const InsertTextFormatSchema = z
  .enum(['plainText', 'snippet'])
  .openapi({ description: 'How the `insertText` of a completion is to be read.' })
  .openapi('InsertTextFormat')

export const CompletionSchema = z
  .object({
    label: z.string().openapi({ description: 'What the completion list shows' }),
    kind: z
      .int32()
      .nullable()
      .openapi({
        description:
          'The LSP `CompletionItemKind` (13 = enum value, 14 = keyword, 10 = property, ...), when the server gives one',
      }),
    detail: z
      .string()
      .nullable()
      .openapi({ description: 'A short type or kind, when the server gives one' }),
    documentation: z
      .string()
      .nullable()
      .openapi({ description: 'The documentation text (Markdown), when the server gives one' }),
    insertText: z
      .string()
      .openapi({ description: 'The text to insert; a snippet keeps its tab stops' }),
    insertTextFormat: InsertTextFormatSchema.openapi({
      description: 'Whether `insertText` is plain text or a snippet',
    }),
    sortText: z
      .string()
      .nullable()
      .openapi({ description: 'The key the list is sorted by, when the server gives one' }),
  })
  .openapi({
    required: [
      'label',
      'kind',
      'detail',
      'documentation',
      'insertText',
      'insertTextFormat',
      'sortText',
    ],
    description: 'One completion the Prisma language server offers.',
    example: {
      label: 'postgresql',
      kind: 12,
      detail: null,
      documentation: 'The PostgreSQL provider',
      insertText: '"postgresql"',
      insertTextFormat: 'plainText',
      sortText: null,
    },
  })
  .openapi('Completion')

export const CompletionsSchema = z
  .object({
    items: z
      .array(CompletionSchema)
      .openapi({ description: "The offered completions in the server's order" }),
  })
  .brand<'Completions'>()
  .openapi({ required: ['items'], description: 'The completions at a position.', example: {} })
  .openapi('Completions')

export const CompleteBodySchema = z
  .object({
    text: SchemaTextSchema.openapi({ description: 'The text as typed' }),
    path: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'The file the text belongs to, so the other loaded schema files are seen; the first file when omitted',
      }),
    line: LineSchema.openapi({ description: 'The cursor line' }),
    character: CharacterSchema.openapi({ description: 'The cursor column' }),
    triggerCharacter: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'The character that opened the list (`@`, `"`, `.`), when one did rather than typing',
      }),
  })
  .openapi({
    required: ['text', 'line', 'character'],
    description: 'A completion request at a cursor position.',
    example: { text: 'datasource db {\n  provider = \n}\n', line: 1, character: 13 },
  })
  .openapi('CompleteBody')

export const HoverSchema = z
  .object({
    contents: z
      .string()
      .nullable()
      .openapi({
        description: 'Markdown to show, or null when there is nothing to say about the position',
      }),
    range: LspRangeSchema.nullable().openapi({
      description: 'The word the hover is about, when the server names it',
    }),
  })
  .brand<'Hover'>()
  .openapi({
    required: ['contents', 'range'],
    description: 'What the Prisma language server says about the symbol under the cursor.',
    example: {
      contents: '```prisma\nmodel User {\n\t...\n}\n```',
      range: { start: { line: 4, character: 9 }, end: { line: 4, character: 13 } },
    },
  })
  .openapi('Hover')

export const PositionBodySchema = z
  .object({
    text: SchemaTextSchema.openapi({ description: 'The text as typed' }),
    path: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'The file the text belongs to, so the other loaded schema files are seen; the first file when omitted',
      }),
    line: LineSchema.openapi({ description: 'The cursor line' }),
    character: CharacterSchema.openapi({ description: 'The cursor column' }),
  })
  .openapi({
    required: ['text', 'line', 'character'],
    description: 'A request about the symbol at a cursor position (hover, definition, references).',
    example: { text: 'model User {\n  id Int @id\n}\n', line: 1, character: 3 },
  })
  .openapi('PositionBody')

export const LspLocationSchema = z
  .object({
    path: z.string().openapi({ description: 'The file, as Studio loaded it' }),
    range: LspRangeSchema.openapi({ description: 'The whole declaration' }),
    selection: LspRangeSchema.openapi({ description: 'The name inside it, to put the cursor on' }),
  })
  .openapi({
    required: ['path', 'range', 'selection'],
    description: 'A place in one of the schema files.',
    example: {
      path: 'prisma/schema.prisma',
      range: { start: { line: 10, character: 0 }, end: { line: 14, character: 1 } },
      selection: { start: { line: 10, character: 6 }, end: { line: 10, character: 10 } },
    },
  })
  .openapi('LspLocation')

export const DefinitionSchema = z
  .object({
    locations: z
      .array(LspLocationSchema)
      .openapi({
        description: 'The declarations, empty when the position holds no reference to one',
      }),
  })
  .brand<'Definition'>()
  .openapi({
    required: ['locations'],
    description: 'Where the symbol at a position is declared.',
    example: { locations: [] },
  })
  .openapi('Definition')

export const LspReferenceSchema = z
  .object({
    path: z.string().openapi({ description: 'The file, as Studio loaded it' }),
    range: LspRangeSchema.openapi({ description: 'The word that refers to the symbol' }),
  })
  .openapi({
    required: ['path', 'range'],
    description: 'One place a symbol is used.',
    example: {
      path: 'prisma/schema.prisma',
      range: { start: { line: 21, character: 9 }, end: { line: 21, character: 13 } },
    },
  })
  .openapi('LspReference')

export const ReferencesSchema = z
  .object({
    locations: z
      .array(LspReferenceSchema)
      .openapi({
        description: 'The uses, including the declaration; empty when the position holds no symbol',
      }),
  })
  .brand<'References'>()
  .openapi({
    required: ['locations'],
    description: 'Every place the symbol at a position is used, across the loaded files.',
    example: { locations: [] },
  })
  .openapi('References')

export const LspFileEditSchema = z
  .object({
    path: z.string().openapi({ description: 'The file, as Studio loaded it' }),
    edits: z
      .array(LspTextEditSchema)
      .openapi({ description: 'The replacements, in document order' }),
  })
  .openapi({
    required: ['path', 'edits'],
    description: 'The edits of one file.',
    example: { path: 'prisma/schema.prisma', edits: [] },
  })
  .openapi('LspFileEdit')

export const RenameSchema = z
  .object({
    changes: z
      .array(LspFileEditSchema)
      .openapi({
        description: 'The edits, grouped by file; empty when the position holds nothing to rename',
      }),
  })
  .brand<'Rename'>()
  .openapi({
    required: ['changes'],
    description: 'The edits a rename makes, per file.',
    example: { changes: [] },
  })
  .openapi('Rename')

export const RenameBodySchema = z
  .object({
    text: SchemaTextSchema.openapi({ description: 'The text as typed' }),
    path: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'The file the text belongs to, so the other loaded schema files are seen; the first file when omitted',
      }),
    line: LineSchema.openapi({ description: 'The cursor line' }),
    character: CharacterSchema.openapi({ description: 'The cursor column' }),
    newName: z.string().openapi({ description: 'The new name' }),
  })
  .openapi({
    required: ['text', 'line', 'character', 'newName'],
    description: 'A rename request: the symbol at a position and its new name.',
    example: { text: 'model User {\n  id Int @id\n}\n', line: 0, character: 7, newName: 'Account' },
  })
  .openapi('RenameBody')

export const CodeActionSchema = z
  .object({
    title: z.string().openapi({ description: 'What the fix does' }),
    changes: z.array(LspFileEditSchema).openapi({ description: 'The edits, grouped by file' }),
    isPreferred: z.boolean().openapi({ description: 'Whether it is the fix to apply first' }),
  })
  .openapi({
    required: ['title', 'changes', 'isPreferred'],
    description: 'One quick fix the language server offers.',
    example: { title: "Change spelling to 'Role'", changes: [], isPreferred: true },
  })
  .openapi('CodeAction')

export const CodeActionsSchema = z
  .object({ actions: z.array(CodeActionSchema).openapi({ description: 'The offered fixes' }) })
  .brand<'CodeActions'>()
  .openapi({
    required: ['actions'],
    description: 'The quick fixes at a range.',
    example: { actions: [] },
  })
  .openapi('CodeActions')

export const CodeActionBodySchema = z
  .object({
    text: SchemaTextSchema.openapi({ description: 'The text as typed' }),
    path: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'The file the text belongs to, so the other loaded schema files are seen; the first file when omitted',
      }),
    range: LspRangeSchema.openapi({ description: 'The range the actions are asked for' }),
    diagnostics: z
      .array(LspDiagnosticSchema)
      .openapi({ description: 'The diagnostics in that range, as the lint route returned them' }),
  })
  .openapi({
    required: ['text', 'range', 'diagnostics'],
    description: 'A code action request: a range and the diagnostics the editor shows in it.',
    example: {
      text: 'model User {\n  role R\n}\n',
      range: { start: { line: 1, character: 7 }, end: { line: 1, character: 8 } },
      diagnostics: [],
    },
  })
  .openapi('CodeActionBody')

export const MigrationRecordSchema = z
  .object({
    name: z.string().openapi({ description: 'The directory name of the migration' }),
    startedAt: z
      .string()
      .nullable()
      .openapi({ description: 'When it started, as the database recorded it' }),
    finishedAt: z
      .string()
      .nullable()
      .openapi({ description: 'When it finished; null while it is running or if it failed' }),
    rolledBackAt: z
      .string()
      .nullable()
      .openapi({ description: 'When it was marked rolled back, if it was' }),
    appliedStepsCount: z.int32().openapi({ description: 'How many statements of it ran' }),
    checksum: z
      .string()
      .openapi({ description: 'The checksum of the migration file as it was when it ran' }),
  })
  .openapi({
    required: ['name', 'startedAt', 'finishedAt', 'rolledBackAt', 'appliedStepsCount', 'checksum'],
    description: 'One migration the database has recorded in `_prisma_migrations`.',
    example: {
      name: '20260101000000_init',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      rolledBackAt: null,
      appliedStepsCount: 1,
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
  })
  .openapi('MigrationRecord')

export const DivergenceSchema = z
  .enum(['databaseIsBehind', 'migrationsDirectoryIsBehind', 'historiesDiverge'])
  .openapi({
    description:
      'How the migration history of the directory and the database differ, when they do.',
  })
  .openapi('Divergence')

export const MigrateStatusSchema = z
  .object({
    migrationsDir: z
      .string()
      .openapi({ description: 'Where the migrations of the project are read from' }),
    hasMigrationsTable: z
      .boolean()
      .openapi({
        description:
          'Whether the database has `_prisma_migrations`; a database never migrated has not',
      }),
    applied: z
      .array(MigrationRecordSchema)
      .openapi({ description: 'Every migration the database has recorded, oldest first' }),
    pending: z
      .array(z.string())
      .openapi({ description: 'Migrations in the directory the database has not applied' }),
    failed: z
      .array(z.string())
      .openapi({ description: 'Migrations that failed and were never resolved' }),
    edited: z
      .array(z.string())
      .openapi({ description: 'Migrations whose file changed after the database ran it' }),
    divergence: DivergenceSchema.nullable().openapi({
      description: 'How the two histories differ, when they do',
    }),
    drift: z
      .boolean()
      .openapi({ description: 'Whether the database differs from the schema, migrations aside' }),
    baselineNeeded: z
      .boolean()
      .openapi({
        description:
          'Whether the database has tables and no migration history, which `prisma migrate deploy`\nrefuses (P3005): it has to be baselined at the migration it already matches',
      }),
    missingFiles: z
      .array(z.string())
      .openapi({
        description:
          'Migrations the database has recorded whose directory the migrations directory does not hold',
      }),
  })
  .brand<'MigrateStatus'>()
  .openapi({
    required: [
      'migrationsDir',
      'hasMigrationsTable',
      'applied',
      'pending',
      'failed',
      'edited',
      'divergence',
      'drift',
      'baselineNeeded',
      'missingFiles',
    ],
    description:
      'The state of the migration history, and whether the database has drifted from the schema.',
    example: {
      migrationsDir: '/app/prisma/migrations',
      hasMigrationsTable: true,
      applied: [],
      pending: ['20260201000000_profile'],
      failed: [],
      edited: [],
      divergence: null,
      drift: true,
      baselineNeeded: false,
      missingFiles: [],
    },
  })
  .openapi('MigrateStatus')

export const BaselineCandidateSchema = z
  .object({
    name: z.string().openapi({ description: 'The directory name of the migration' }),
    matches: z
      .boolean()
      .openapi({
        description:
          'Whether the database is what this migration and those before it make of an empty one',
      }),
    difference: z
      .string()
      .openapi({
        description:
          'The SQL that would take what the migrations make to the database; empty when it matches',
      }),
  })
  .openapi({
    required: ['name', 'matches', 'difference'],
    description: 'One migration the database could be baselined at, and whether it matches.',
    example: { name: '20260101000000_init', matches: true, difference: '' },
  })
  .openapi('BaselineCandidate')

export const MigrateBaselineSchema = z
  .object({
    candidates: z
      .array(BaselineCandidateSchema)
      .openapi({ description: 'Every migration of the directory, oldest first' }),
  })
  .brand<'MigrateBaseline'>()
  .openapi({
    required: ['candidates'],
    description:
      'Where the database could be baselined: each migration, replayed into a shadow database.',
    example: { candidates: [] },
  })
  .openapi('MigrateBaseline')

export const MarkAppliedBodySchema = z
  .object({
    name: z.string().openapi({ description: 'The directory name of the migration to record' }),
  })
  .openapi({
    required: ['name'],
    description: 'A migration whose statements have already been run.',
    example: { name: '20260201000000_profile' },
  })
  .openapi('MarkAppliedBody')

export const MigrateDiffSchema = z
  .object({
    sql: z
      .string()
      .openapi({
        description:
          'The migration Prisma Migrate would write, empty when the database matches the schema',
      }),
    drift: z.boolean().openapi({ description: 'Whether there was anything to write' }),
  })
  .brand<'MigrateDiff'>()
  .openapi({
    required: ['sql', 'drift'],
    description: 'The statements that would take the database to the schema.',
    example: { sql: '-- AlterTable\nALTER TABLE "User" ADD COLUMN "name" TEXT;\n', drift: true },
  })
  .openapi('MigrateDiff')

export const StepKindSchema = z
  .enum(['fix', 'migration'])
  .openapi({ description: 'What a step of a plan does, which says how much care it needs.' })
  .openapi('StepKind')

export const MigrationChangeSchema = z
  .object({
    kind: z
      .string()
      .openapi({
        description:
          '`create-enum`, `create-table`, `rebuild-table`, `copy-rows`, `drop-table`, `add-column`,\n`drop-column`, `foreign-key`, `unique` or `index`',
      }),
    table: z.string().openapi({ description: 'The table it is about' }),
    columns: z
      .array(z.string())
      .openapi({ description: 'The columns it is about, when it is about some' }),
    target: z
      .string()
      .nullable()
      .openapi({ description: 'The table a foreign key points at; null otherwise' }),
  })
  .openapi({
    required: ['kind', 'table', 'columns', 'target'],
    description: 'One change a step makes, for the page to say in its own language.',
    example: { kind: 'foreign-key', table: 'Post', columns: ['categoryId'], target: 'Category' },
  })
  .openapi('MigrationChange')

export const MigrationStepSchema = z
  .object({
    title: z
      .string()
      .openapi({ description: 'What the step does, for the person deciding whether to run it' }),
    kind: StepKindSchema.openapi({ description: 'Whether it changes rows or the schema' }),
    statements: z
      .array(z.string())
      .openapi({ description: 'The statements of the step, in the order they must run' }),
    changes: z
      .array(MigrationChangeSchema)
      .openapi({
        description:
          'What it does, one change each, in the words of the schema rather than of the database',
      }),
    destructive: z
      .boolean()
      .openapi({
        description:
          'Whether it loses rows or what a column holds; a table rebuilt in place loses neither',
      }),
    rows: z
      .int32()
      .nullable()
      .openapi({
        description:
          'How many rows a fix will change, counted against the database now; null for a schema step',
      }),
    subject: z
      .string()
      .nullable()
      .openapi({
        description:
          'The field or relation a fix changes the rows of (`User.email`); null for a schema step',
      }),
    fixKind: z
      .string()
      .nullable()
      .openapi({
        description:
          'What a fix does to them: `nulls`, `values`, `duplicates`, `orphans`, `invalid`, `convert` or\n`fill`; null for a schema step',
      }),
  })
  .openapi({
    required: [
      'title',
      'kind',
      'statements',
      'changes',
      'destructive',
      'rows',
      'subject',
      'fixKind',
    ],
    description: 'One step of a plan: statements that are run, and reported, together.',
    example: {
      title: 'Add the column',
      kind: 'migration',
      statements: ['ALTER TABLE "User" ADD COLUMN "name" TEXT'],
      changes: [{ kind: 'add-column', table: 'User', columns: ['name'], target: null }],
      destructive: false,
      rows: null,
      subject: null,
      fixKind: null,
    },
  })
  .openapi('MigrationStep')

export const MigrationSuggestionSchema = z
  .object({
    choice: z.string().openapi({ description: 'One of the choices of the check' }),
    value: z
      .string()
      .nullable()
      .openapi({ description: 'What the choice needs, as a decision carries it' }),
    reason: z
      .string()
      .openapi({
        description:
          'Why it is offered: `schema-default`, `uuid`, `random-id`, `now`, `from-key`, `empty-string`,\n`zero`, `false`, `empty-object`, `first-referenced`, `enum-first`, `enum-default`,\n`enum-same-name`, `enum-replaced`, `oldest`, `first-by-key`, `optional-relation`,\n`required-relation`, `renamed`, `moved`, `convert-number`, `clamp`,\n`truncate`, `nullable` or `not-nullable`',
      }),
  })
  .openapi({
    required: ['choice', 'value', 'reason'],
    description: 'A decision offered ready-made: nothing is decided until it is taken.',
    example: { choice: 'keep-first-delete', value: 'createdAt', reason: 'oldest' },
  })
  .openapi('MigrationSuggestion')

export const MigrationDestinationSchema = z
  .object({
    choice: z
      .string()
      .openapi({
        description: '`rename` for a column of the same table, `move` for one of a related model',
      }),
    value: z
      .string()
      .openapi({ description: 'What the decision names: the field, or `Model.field` for a move' }),
    type: z.string().openapi({ description: 'The Prisma type of the column' }),
    fits: z.boolean().openapi({ description: 'Whether the values fit its kind (text takes any)' }),
    relation: z
      .string()
      .openapi({
        description:
          "How the tables are related: `same` table, the destination's rows `points-here` (a profile at\nits user), or this table's rows point at the destination's (`pointed-at`)",
      }),
    via: z
      .string()
      .nullable()
      .openapi({
        description:
          'The foreign key the values move along, `Profile.userId → User.id`; null for a rename',
      }),
    created: z
      .boolean()
      .openapi({
        description:
          "Whether the migration creates the destination's table, whose rows are made from the values",
      }),
  })
  .openapi({
    required: ['choice', 'value', 'type', 'fits', 'relation', 'via', 'created'],
    description: 'A column the migration adds that the values of a dropped column could go to.',
    example: {
      choice: 'move',
      value: 'Profile.nickname',
      type: 'String',
      fits: true,
      relation: 'points-here',
      via: 'Profile.userId → User.id',
      created: true,
    },
  })
  .openapi('MigrationDestination')

export const CheckStatusSchema = z
  .enum(['passed', 'blocking', 'warning', 'failed', 'guaranteed'])
  .openapi({
    description:
      'How a check came out: nothing found, something that blocks, or a query that failed.',
  })
  .openapi('CheckStatus')

export const MigrationCheckSchema = z
  .object({
    kind: z
      .string()
      .openapi({
        description: 'Which check it is (`not-null`, `unique`, `enum`, `foreign-key`, ...)',
      }),
    modelName: z.string().openapi({ description: 'The model it is about' }),
    subject: z.string().openapi({ description: 'The model and field it is about' }),
    what: z.string().openapi({ description: 'What the migration asks of them' }),
    hint: z.string().openapi({ description: 'What to do about it, in a sentence' }),
    field: z
      .string()
      .openapi({
        description: 'The field, or the relation for a foreign key, a decision about it is made on',
      }),
    choices: z
      .array(z.string())
      .openapi({ description: 'What can be decided about it on the page, empty when nothing can' }),
    facts: z
      .record(z.string(), z.string())
      .openapi({
        description:
          'What to read it by, for the page to say in its own language: `model`, `field`, `what`, and by\nkind `type`, `enum`, `removed`, `members`, `member`, `fields`, `orderBy`, `target`, `column`,\n`renamedTo`, `from`, `to`, `default` or `table`',
      }),
    lost: z
      .string()
      .nullable()
      .openapi({
        description:
          'A query for the rows and values the change loses, as the database holds them now (a column or\ntable dropped, a column added again); null when it loses none',
      }),
    suggestion: MigrationSuggestionSchema.nullable().openapi({
      description:
        'The decision read from the schema and the database as the likeliest fit; null when there is none',
    }),
    candidates: z
      .array(MigrationSuggestionSchema)
      .openapi({
        description:
          'Where the values of a dropped column could have gone, the likeliest first: a column of the same\ntable (`rename`) or of a related model (`move`) the migration adds, by the likeness of its name\nand kind, each with why (`same-name`, `similar-name`, `same-name-related` or\n`similar-name-related`). Empty when nowhere reads as one, and the values are lost.',
      }),
    destinations: z
      .array(MigrationDestinationSchema)
      .openapi({
        description:
          'Every column the migration adds that the values of a dropped column could go to, whatever its\nname: for the page to complete the field a rename or a move names, and to show how it moves',
      }),
    status: CheckStatusSchema.openapi({ description: 'How it came out' }),
    count: z
      .int32()
      .nullable()
      .openapi({ description: "How many rows fail it; null when the check's query failed" }),
    error: z
      .string()
      .nullable()
      .openapi({ description: 'Why the check could not be counted, when it could not' }),
  })
  .openapi({
    required: [
      'kind',
      'modelName',
      'subject',
      'what',
      'hint',
      'field',
      'choices',
      'facts',
      'lost',
      'suggestion',
      'candidates',
      'destinations',
      'status',
      'count',
      'error',
    ],
    description: 'One thing the migration needs of the rows the database holds now.',
    example: {
      kind: 'unique',
      modelName: 'User',
      subject: 'User.email',
      what: 'unique',
      hint: 'Delete the duplicates before the key is made, or say which stays on the Migrate page.',
      field: 'email',
      choices: ['keep-first-delete'],
      facts: { model: 'User', field: 'email', what: 'unique', fields: 'email' },
      lost: null,
      suggestion: { choice: 'keep-first-delete', value: null, reason: 'first-by-key' },
      candidates: [],
      destinations: [],
      status: 'blocking',
      count: 2,
      error: null,
    },
  })
  .openapi('MigrationCheck')

export const UnfitDecisionSchema = z
  .object({
    kind: z.string().openapi({ description: 'The check it answered' }),
    modelName: z.string().openapi({ description: 'The model it is about' }),
    field: z.string().openapi({ description: 'The field, or the relation for a foreign key' }),
    choice: z.string().openapi({ description: 'What it said to do' }),
    value: z
      .string()
      .nullable()
      .openapi({ description: 'What the choice was given; null when it needed nothing' }),
    reasons: z
      .array(z.string())
      .openapi({ description: 'What no longer fits, as the check says it' }),
  })
  .openapi({
    required: ['kind', 'modelName', 'field', 'choice', 'value', 'reasons'],
    description: 'A kept decision that no longer fits, and why.',
    example: {
      kind: 'column-added',
      modelName: 'User',
      field: 'hekireki',
      choice: 'value',
      value: '',
      reasons: ['User.hekireki: User has no field hekireki.'],
    },
  })
  .openapi('UnfitDecision')

export const MigrationPreviewSchema = z
  .object({
    modelName: z.string().openapi({ description: 'The model the rows belong to' }),
    sql: z
      .string()
      .openapi({ description: 'The query that shows them; it reads, and changes nothing' }),
  })
  .openapi({
    required: ['modelName', 'sql'],
    description:
      'The rows of one model as the fixes will leave them, from a query that writes nothing.',
    example: {
      modelName: 'User',
      sql: 'WITH hk_fix_0 AS (...) SELECT * FROM hk_fix_0 ORDER BY id',
    },
  })
  .openapi('MigrationPreview')

export const MigratePlanSchema = z
  .object({
    name: z
      .string()
      .openapi({ description: 'The directory name the migration would be written under' }),
    steps: z
      .array(MigrationStepSchema)
      .openapi({ description: 'The steps, in the order they must run' }),
    checks: z
      .array(MigrationCheckSchema)
      .openapi({ description: 'What the migration needs of the rows the database holds now' }),
    unfit: z
      .array(UnfitDecisionSchema)
      .openapi({
        description:
          'Kept decisions set aside because they no longer fit the schema or the database: a field or\nmodel the schema has lost since they were made. The plan is made without them.',
      }),
    previews: z
      .array(MigrationPreviewSchema)
      .openapi({
        description: "Each fixed model's rows as the fixes will leave them, before anything is run",
      }),
    notes: z.array(z.string()).openapi({ description: 'What the person running it needs to know' }),
    errors: z
      .array(z.string())
      .openapi({ description: 'Why the plan cannot be run as it is, when it cannot' }),
  })
  .brand<'MigratePlan'>()
  .openapi({
    required: ['name', 'steps', 'checks', 'unfit', 'previews', 'notes', 'errors'],
    description: 'A migration laid out as steps that can be run one at a time.',
    example: {
      name: '20260201000000_profile',
      steps: [],
      checks: [],
      unfit: [],
      previews: [],
      notes: [],
      errors: [],
    },
  })
  .openapi('MigratePlan')

export const MigrationDecisionSchema = z
  .object({
    kind: z
      .string()
      .openapi({ description: 'The check it answers (`not-null`, `unique`, `foreign-key`, ...)' }),
    modelName: z.string().openapi({ description: 'The model it is about' }),
    field: z.string().openapi({ description: 'The field, or the relation for a foreign key' }),
    choice: z.string().openapi({ description: 'What to do, from the choices the check offers' }),
    value: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'What a choice needs, when it needs something: the value or SQL written, the field a rename\nbecame, the `STORED=MEMBER` pairs of an enum, or the field duplicates are ordered by',
      }),
  })
  .openapi({
    required: ['kind', 'modelName', 'field', 'choice'],
    description:
      'A decision made on the page: which check it answers, what it is about, and what to do. Studio\nkeeps them in `.hekireki/migrate.json` beside the schema, and `hekireki migrate check` and\n`hekireki migrate plan` read the same file, so the command line makes the same plan.',
    example: {
      kind: 'not-null',
      modelName: 'User',
      field: 'name',
      choice: 'value',
      value: 'unknown',
    },
  })
  .openapi('MigrationDecision')

export const PlanBodySchema = z
  .object({
    name: z
      .string()
      .exactOptional()
      .openapi({ description: 'What to call it; the timestamp is put in front' }),
    decisions: z
      .array(MigrationDecisionSchema)
      .exactOptional()
      .openapi({
        description:
          'Every decision to plan with, in place of the ones kept; the kept ones when left out',
      }),
    batch: z
      .int32()
      .min(1)
      .exactOptional()
      .openapi({
        description:
          'The most rows one statement of a fix changes: a fix over more is run that many at a time, so\nnone holds its locks on the whole table; all of them at once when left out',
      }),
  })
  .openapi({
    description: 'The name to propose for a migration, and the decisions made for it on the page.',
    example: { name: 'profile', decisions: [] },
  })
  .openapi('PlanBody')

export const StatementResultSchema = z
  .object({
    sql: z.string().openapi({ description: 'The statement as it was sent' }),
    affected: z
      .int32()
      .nullable()
      .openapi({ description: 'How many rows it changed; null when it failed' }),
    error: z
      .string()
      .nullable()
      .openapi({ description: 'What the database said, when it refused' }),
  })
  .openapi({
    required: ['sql', 'affected', 'error'],
    description: 'What one statement did, or why the database refused it.',
    example: { sql: 'ALTER TABLE "User" ADD COLUMN "name" TEXT', affected: 0, error: null },
  })
  .openapi('StatementResult')

export const ApplyResultSchema = z
  .object({
    results: z
      .array(StatementResultSchema)
      .openapi({
        description:
          'One result per statement attempted; the ones after a failure are not attempted',
      }),
    failedAt: z
      .int32()
      .nullable()
      .openapi({ description: 'The index of the statement that failed, null when none did' }),
    ok: z.boolean().openapi({ description: 'Whether every statement ran' }),
  })
  .brand<'ApplyResult'>()
  .openapi({
    required: ['results', 'failedAt', 'ok'],
    description: 'How far a staged apply got.',
    example: { results: [], failedAt: null, ok: true },
  })
  .openapi('ApplyResult')

export const ApplyBodySchema = z
  .object({
    statements: z
      .array(z.string())
      .openapi({ description: 'The statements, in the order they must run' }),
  })
  .openapi({
    required: ['statements'],
    description: 'Statements to run, one at a time.',
    example: { statements: ['ALTER TABLE "User" ADD COLUMN "name" TEXT'] },
  })
  .openapi('ApplyBody')

export const RehearsalStepSchema = z
  .object({
    ran: z
      .boolean()
      .openapi({ description: 'Whether it was run; a step after one that failed is not' }),
    ok: z.boolean().openapi({ description: 'Whether every statement of it went through' }),
    affected: z
      .int32()
      .nullable()
      .openapi({ description: 'The rows its statements changed; null when it was not run' }),
    error: z
      .string()
      .nullable()
      .openapi({ description: 'What the database said to the statement it refused' }),
    statement: z.string().nullable().openapi({ description: 'The statement it refused' }),
  })
  .openapi({
    required: ['ran', 'ok', 'affected', 'error', 'statement'],
    description: 'How one step went in the rehearsal.',
    example: { ran: true, ok: true, affected: 2, error: null, statement: null },
  })
  .openapi('RehearsalStep')

export const TableRowsSchema = z
  .object({
    table: z.string().openapi({ description: 'The table, as the database names it' }),
    before: z
      .int32()
      .nullable()
      .openapi({
        description: 'Its rows before; null when it was not there, or could not be counted',
      }),
    after: z
      .int32()
      .nullable()
      .openapi({ description: 'Its rows after; null when it is gone, or could not be counted' }),
  })
  .openapi({
    required: ['table', 'before', 'after'],
    description: "A table's rows, counted before and after.",
    example: { table: 'User', before: 5, after: 4 },
  })
  .openapi('TableRows')

export const RehearsalSchema = z
  .object({
    ok: z.boolean().openapi({ description: 'Whether every step went through' }),
    steps: z.array(RehearsalStepSchema).openapi({ description: 'How each step went, in order' }),
    tables: z
      .array(TableRowsSchema)
      .openapi({ description: "Every table's rows before the steps and after them" }),
    schemaMatches: z
      .boolean()
      .openapi({ description: 'Whether the database the steps left matches the schema' }),
    difference: z
      .string()
      .openapi({
        description:
          'What still differs from the schema, as the SQL that would close it; empty when it matches',
      }),
    limitations: z
      .array(z.string())
      .openapi({
        description:
          'What the rehearsal could not show: `outside-transaction` when a step (an index made\nCONCURRENTLY, an enum value added) cannot run in the transaction PostgreSQL rehearses in.\nWhat it cost: `locks-tables` when it ran in a transaction on the database itself, which\nholds the locks of its steps until the rollback (it waits five seconds for one, no longer)',
      }),
  })
  .brand<'Rehearsal'>()
  .openapi({
    required: ['ok', 'steps', 'tables', 'schemaMatches', 'difference', 'limitations'],
    description:
      'The migration run for real and taken back: on SQLite on a copy of the file, on PostgreSQL in a\ntransaction rolled back whatever happens. Nothing of it remains in the database.',
    example: {
      ok: true,
      steps: [],
      tables: [],
      schemaMatches: true,
      difference: '',
      limitations: [],
    },
  })
  .openapi('Rehearsal')

export const RehearseBodySchema = z
  .object({
    steps: z
      .array(z.array(z.string()))
      .openapi({ description: "Each step's statements, in the order they run" }),
  })
  .openapi({
    required: ['steps'],
    description: 'The steps of a plan, to rehearse.',
    example: { steps: [['ALTER TABLE "User" ADD COLUMN "name" TEXT']] },
  })
  .openapi('RehearseBody')

export const TableCountsSchema = z
  .object({
    tables: z
      .array(TableRowsSchema)
      .openapi({
        description: 'Each table and its rows; `before` is null and `after` is the count',
      }),
  })
  .brand<'TableCounts'>()
  .openapi({
    required: ['tables'],
    description: 'The rows of every table of the database now.',
    example: { tables: [] },
  })
  .openapi('TableCounts')

export const BackupSchema = z
  .object({
    name: z.string().openapi({ description: 'What it is called: when it was taken' }),
    location: z.string().openapi({ description: 'The file on SQLite, the schema on PostgreSQL' }),
    size: z
      .int32()
      .nullable()
      .openapi({ description: "The file's size in bytes; null for a schema" }),
    restorable: z
      .boolean()
      .openapi({
        description:
          'Whether Studio can restore it: a SQLite file, or a PostgreSQL schema that keeps the statements\nof its restore; one taken before Studio kept them is its rows only, in the schema named',
      }),
  })
  .openapi({
    required: ['name', 'location', 'size', 'restorable'],
    description: 'A copy of the database taken before a migration that loses data.',
    example: {
      name: 'backup_20260917101500123',
      location: '/app/prisma/.hekireki/backups/backup_20260917101500123.db',
      size: 356352,
      restorable: true,
    },
  })
  .openapi('Backup')

export const BackupsSchema = z
  .object({ backups: z.array(BackupSchema).openapi({ description: 'Newest first' }) })
  .brand<'Backups'>()
  .openapi({
    required: ['backups'],
    description: 'The backups there are, newest first.',
    example: { backups: [] },
  })
  .openapi('Backups')

export const RestoreBodySchema = z
  .object({
    name: z.string().openapi({ description: "The backup's name" }),
    migration: z
      .string()
      .exactOptional()
      .openapi({
        description:
          'The migration written by the run the backup was taken for, to remove from the directory',
      }),
  })
  .openapi({
    required: ['name'],
    description: 'A backup to restore, and the migration the restore undoes.',
    example: { name: 'backup_20260917101500123', migration: '20260917101530_profile' },
  })
  .openapi('RestoreBody')

export const MigrationFileSchema = z
  .object({
    name: z.string().openapi({ description: 'The directory name of the migration' }),
    file: z.string().openapi({ description: 'Where its migration.sql is' }),
    sql: z.string().openapi({ description: 'What the migration.sql holds' }),
  })
  .brand<'MigrationFile'>()
  .openapi({
    required: ['name', 'file', 'sql'],
    description: 'One migration of the directory, and the SQL it holds.',
    example: {
      name: '20260201000000_profile',
      file: '/app/prisma/migrations/20260201000000_profile/migration.sql',
      sql: '-- AlterTable\nALTER TABLE "User" ADD COLUMN "name" TEXT;\n',
    },
  })
  .openapi('MigrationFile')

export const CreatedMigrationSchema = z
  .object({
    name: z.string().openapi({ description: 'The directory name it was written under' }),
    file: z.string().openapi({ description: 'The migration.sql that was written' }),
  })
  .brand<'CreatedMigration'>()
  .openapi({
    required: ['name', 'file'],
    description: 'Where a migration was written.',
    example: {
      name: '20260201000000_profile',
      file: '/app/prisma/migrations/20260201000000_profile/migration.sql',
    },
  })
  .openapi('CreatedMigration')

export const CreateMigrationBodySchema = z
  .object({
    name: z.string().openapi({ description: 'What to call it; the timestamp is put in front' }),
    sql: z.string().openapi({ description: 'The statements to write to migration.sql' }),
  })
  .openapi({
    required: ['name', 'sql'],
    description: 'A migration to write to the migrations directory.',
    example: { name: 'profile', sql: 'ALTER TABLE "User" ADD COLUMN "name" TEXT;\n' },
  })
  .openapi('CreateMigrationBody')

export const MigrationDecisionsSchema = z
  .object({
    file: z
      .string()
      .openapi({ description: 'The file the decisions are kept in, beside the schema' }),
    decisions: z
      .array(MigrationDecisionSchema)
      .openapi({ description: 'The decisions, in the order they were made' }),
  })
  .brand<'MigrationDecisions'>()
  .openapi({
    required: ['file', 'decisions'],
    description: 'What has been decided on the page, and where Studio keeps it.',
    example: { file: '/app/prisma/.hekireki/migrate.json', decisions: [] },
  })
  .openapi('MigrationDecisions')

export const DecisionsBodySchema = z
  .object({
    decisions: z
      .array(MigrationDecisionSchema)
      .openapi({ description: 'All of them: what is left out is forgotten' }),
  })
  .openapi({
    required: ['decisions'],
    description: 'Decisions to keep, replacing the ones kept now.',
    example: { decisions: [] },
  })
  .openapi('DecisionsBody')

export const DeployedSchema = z
  .object({
    applied: z
      .array(z.string())
      .openapi({ description: 'The migrations that were applied, oldest first' }),
  })
  .brand<'Deployed'>()
  .openapi({
    required: ['applied'],
    description: 'The migrations a deploy ran.',
    example: { applied: ['20260201000000_profile'] },
  })
  .openapi('Deployed')

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

export const DocsFieldSchema = z
  .object({
    name: z.string().openapi({ description: 'The field name' }),
    type: z
      .string()
      .openapi({ description: 'The type as written, with `?` for optional and `[]` for lists' }),
    bareTypeName: z
      .string()
      .openapi({
        description: 'The type name without modifiers, used to link to the output type or enum',
      }),
    kind: FieldKindSchema.openapi({
      description:
        "What the field holds: a relation links to the model's output type, an enum to its enum section",
    }),
    directives: z
      .array(z.string())
      .openapi({
        description: 'The field attributes (`@id`, `@unique`, `@default(...)`, `@updatedAt`)',
      }),
    documentation: z.string().nullable().openapi({ description: 'The `///` doc comment' }),
    required: z.boolean().openapi({ description: 'Whether the field is required' }),
  })
  .openapi({
    required: ['name', 'type', 'bareTypeName', 'kind', 'directives', 'documentation', 'required'],
    description: 'One field of a model, as the documentation shows it.',
    example: {
      name: 'email',
      type: 'String',
      bareTypeName: 'String',
      kind: 'scalar',
      directives: ['@unique'],
      documentation: 'Sign-in address',
      required: true,
    },
  })
  .openapi('DocsField')

export const DocsTypeLocationSchema = z
  .enum(['scalar', 'inputObjectTypes', 'outputObjectTypes', 'enumTypes', 'fieldRefTypes'])
  .openapi({
    description:
      'Where a referenced type of the Prisma client API is declared, which decides what the page links to.',
  })
  .openapi('DocsTypeLocation')

export const DocsTypeRefSchema = z
  .object({
    type: z
      .string()
      .openapi({
        description: 'The type name: a scalar, an enum, an input type or an output type',
      }),
    isList: z.boolean().openapi({ description: 'Whether the reference is a list of that type' }),
    location: DocsTypeLocationSchema.openapi({ description: 'Where the type is declared' }),
  })
  .openapi({
    required: ['type', 'isList', 'location'],
    description: 'A reference to a type in the Prisma client API.',
    example: { type: 'UserWhereInput', isList: false, location: 'inputObjectTypes' },
  })
  .openapi('DocsTypeRef')

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
      types: [{ type: 'UserWhereUniqueInput', isList: false, location: 'inputObjectTypes' }],
      required: true,
    },
  })
  .openapi('DocsOperationInput')

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
        {
          name: 'where',
          types: [{ type: 'UserWhereUniqueInput', isList: false, location: 'inputObjectTypes' }],
          required: true,
        },
      ],
      output: { type: 'User', required: false, list: false },
    },
  })
  .openapi('DocsOperation')

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
    example: {
      name: 'email',
      types: [{ type: 'String', isList: false, location: 'scalar' }],
      nullable: false,
    },
  })
  .openapi('DocsTypeField')

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

export const DocsEnumSchema = z
  .object({
    name: z.string().openapi({ description: 'The enum name' }),
    values: z.array(z.string()).openapi({ description: 'The values in declaration order' }),
  })
  .openapi({
    required: ['name', 'values'],
    description:
      'One enum of the Prisma client API: a schema enum, or one Prisma derives (`SortOrder`, `UserScalarFieldEnum`).',
    example: { name: 'Role', values: ['ADMIN', 'VIEWER'] },
  })
  .openapi('DocsEnum')

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
    enumTypes: z
      .array(DocsEnumSchema)
      .openapi({
        description:
          'The enums: the schema enums, then the ones Prisma derives (`SortOrder`, `UserScalarFieldEnum`, ...)',
      }),
  })
  .brand<'Docs'>()
  .openapi({
    required: ['models', 'inputTypes', 'outputTypes', 'enumTypes'],
    description:
      'Everything the documentation page shows: the models with their operations, then the client API types.',
    example: { models: [], inputTypes: [], outputTypes: [], enumTypes: [] },
  })
  .openapi('Docs')

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
    'Server-sent events: `ready` (data: the current `updatedAt`) on connect, `change` (data: the\nnew `updatedAt`) after every reload, `migrations` (data: when it was seen) after the\nmigrations directory changes, and `ping` every 15 seconds to keep the connection open.',
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
    'Run the statements one by one and return the rows of the last, or its affected count for a write, with the wall time of the whole.',
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

export const postDbExplainRoute = createRoute({
  method: 'post',
  path: '/db/explain',
  tags: ['db'],
  description: 'The execution plan the database chooses for the first statement of the text.',
  operationId: 'explainSql',
  request: { body: { content: { 'application/json': { schema: SqlBodySchema } }, required: true } },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: PlanSchema } },
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

export const postDbAnalyzeRoute = createRoute({
  method: 'post',
  path: '/db/analyze',
  tags: ['db'],
  description:
    "Analyze the statements against the Prisma schema's tables: data flow, lineage, row type, parameters and problems.",
  operationId: 'analyzeSql',
  request: {
    body: { content: { 'application/json': { schema: AnalyzeBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: AnalysisSchema } },
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

export const getClientRoute = createRoute({
  method: 'get',
  path: '/client',
  tags: ['client'],
  description:
    "Load the project's Prisma Client, the first time it is asked for, and say whether it could.",
  operationId: 'readClientStatus',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientStatusSchema } },
    },
    500: {
      description: '500 Internal Server Error (`application/problem+json`)',
      content: { 'application/problem+json': { schema: InternalServerProblemSchema } },
    },
  },
})

export const postClientAnalyzeRoute = createRoute({
  method: 'post',
  path: '/client/analyze',
  tags: ['client'],
  description:
    "Read the query against the schema's models, without running it: its calls and its problems.",
  operationId: 'analyzeClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientQueryBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientAnalysisSchema } },
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

export const postClientCompleteRoute = createRoute({
  method: 'post',
  path: '/client/complete',
  tags: ['client'],
  description: "The completions TypeScript offers at a position, against the client's types.",
  operationId: 'completeClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientPositionBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientCompletionsSchema } },
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

export const postClientCompleteDetailRoute = createRoute({
  method: 'post',
  path: '/client/complete/detail',
  tags: ['client'],
  description: 'The type and documentation of one completion item.',
  operationId: 'detailClientCompletion',
  request: {
    body: {
      content: { 'application/json': { schema: ClientCompletionDetailBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientCompletionDetailSchema } },
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

export const postClientHoverRoute = createRoute({
  method: 'post',
  path: '/client/hover',
  tags: ['client'],
  description: 'What TypeScript says about the symbol at a position.',
  operationId: 'hoverClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientPositionBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientHoverSchema } },
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

export const postClientSignatureRoute = createRoute({
  method: 'post',
  path: '/client/signature',
  tags: ['client'],
  description: 'The signatures of the call the cursor is inside.',
  operationId: 'signatureClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientPositionBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientSignatureHelpSchema } },
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

export const postClientFormatRoute = createRoute({
  method: 'post',
  path: '/client/format',
  tags: ['client'],
  description:
    'The query laid out as the TypeScript formatter writes it; a query that does not parse is reported on `query`.',
  operationId: 'formatClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientQueryBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientFormattedSchema } },
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

export const postClientCheckRoute = createRoute({
  method: 'post',
  path: '/client/check',
  tags: ['client'],
  description: "What TypeScript finds wrong with the query, checked against the client's types.",
  operationId: 'checkClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientQueryBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientTypeDiagnosticsSchema } },
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

export const postClientPreviewRoute = createRoute({
  method: 'post',
  path: '/client/preview',
  tags: ['client'],
  description:
    'Run a query that only reads to show the SQL it sends while it is typed; a write is refused on `query`.',
  operationId: 'previewClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientQueryBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientPreviewSchema } },
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

export const postClientRunRoute = createRoute({
  method: 'post',
  path: '/client/run',
  tags: ['client'],
  description:
    "Run the query through the project's Prisma Client and return its result with the SQL it sent.",
  operationId: 'runClientQuery',
  request: {
    body: { content: { 'application/json': { schema: ClientQueryBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ClientResultSchema } },
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
  description: 'The edits that lay the text out as the Prisma formatter does.',
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

export const postPrismaSymbolsRoute = createRoute({
  method: 'post',
  path: '/prisma/symbols',
  tags: ['prisma'],
  description: "The blocks of the text, as the language server's document outline lists them.",
  operationId: 'symbolsSchemaText',
  request: {
    body: { content: { 'application/json': { schema: TextBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: SymbolsSchema } },
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

export const postPrismaHoverRoute = createRoute({
  method: 'post',
  path: '/prisma/hover',
  tags: ['prisma'],
  description: 'What the Prisma language server says about the symbol at a cursor position.',
  operationId: 'hoverSchemaText',
  request: {
    body: { content: { 'application/json': { schema: PositionBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: HoverSchema } },
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

export const postPrismaDefinitionRoute = createRoute({
  method: 'post',
  path: '/prisma/definition',
  tags: ['prisma'],
  description: 'Where the model, enum or type referenced at a cursor position is declared.',
  operationId: 'defineSchemaText',
  request: {
    body: { content: { 'application/json': { schema: PositionBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: DefinitionSchema } },
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

export const postPrismaReferencesRoute = createRoute({
  method: 'post',
  path: '/prisma/references',
  tags: ['prisma'],
  description: 'Every place the symbol at a cursor position is used, across the loaded files.',
  operationId: 'referencesSchemaText',
  request: {
    body: { content: { 'application/json': { schema: PositionBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ReferencesSchema } },
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

export const postPrismaRenameRoute = createRoute({
  method: 'post',
  path: '/prisma/rename',
  tags: ['prisma'],
  description:
    'The edits that rename the model or enum at a cursor position everywhere it is used.',
  operationId: 'renameSchemaText',
  request: {
    body: { content: { 'application/json': { schema: RenameBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: RenameSchema } },
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

export const postPrismaCodeActionsRoute = createRoute({
  method: 'post',
  path: '/prisma/code-actions',
  tags: ['prisma'],
  description: 'The quick fixes the Prisma language server offers for the diagnostics in a range.',
  operationId: 'codeActionsSchemaText',
  request: {
    body: { content: { 'application/json': { schema: CodeActionBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: CodeActionsSchema } },
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

export const getMigrateRoute = createRoute({
  method: 'get',
  path: '/migrate',
  tags: ['migrate'],
  description:
    'The migration history of the database against the migrations directory, and whether the\ndatabase has drifted from the schema. Reads only.',
  operationId: 'readMigrateStatus',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrateStatusSchema } },
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

export const getMigrateBaselineRoute = createRoute({
  method: 'get',
  path: '/migrate/baseline',
  tags: ['migrate'],
  description:
    'Which migrations the database already matches, for a database with tables and no history:\neach migration and those before it replayed into a shadow database and compared with it.\nReads the database; writes nothing to it.',
  operationId: 'readMigrateBaseline',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrateBaselineSchema } },
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

export const postMigrateBaselineRoute = createRoute({
  method: 'post',
  path: '/migrate/baseline',
  tags: ['migrate'],
  description:
    'Baselines the database: records the migration named and every one before it as applied,\nwithout running them. Refused when the database does not match them.',
  operationId: 'baselineMigrations',
  request: {
    body: { content: { 'application/json': { schema: MarkAppliedBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrateStatusSchema } },
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

export const getMigrateDiffRoute = createRoute({
  method: 'get',
  path: '/migrate/diff',
  tags: ['migrate'],
  description:
    'The migration that would take the database to the schema, as Prisma Migrate would write it.\nReads the database; writes nothing to it.',
  operationId: 'readMigrateDiff',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrateDiffSchema } },
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

export const postMigratePlanRoute = createRoute({
  method: 'post',
  path: '/migrate/plan',
  tags: ['migrate'],
  description:
    'The migration laid out as steps that can be run one at a time, the statements that change\nrows before the ones that change the schema.',
  operationId: 'planMigration',
  request: {
    body: { content: { 'application/json': { schema: PlanBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigratePlanSchema } },
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

export const postMigrateApplyRoute = createRoute({
  method: 'post',
  path: '/migrate/apply',
  tags: ['migrate'],
  description:
    'Runs the statements one at a time and stops at the first the database refuses. What ran\nstays run: none of the three databases undoes a DDL statement already done.',
  operationId: 'applyMigrationStatements',
  request: {
    body: { content: { 'application/json': { schema: ApplyBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: ApplyResultSchema } },
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

export const postMigrateRehearseRoute = createRoute({
  method: 'post',
  path: '/migrate/rehearse',
  tags: ['migrate'],
  description:
    'The migration run for real and taken back, to see before it runs whether it goes through,\nwhat it does to the rows of each table, and whether the database then matches the schema.',
  operationId: 'rehearseMigration',
  request: {
    body: { content: { 'application/json': { schema: RehearseBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: RehearsalSchema } },
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

export const getMigrateTablesRoute = createRoute({
  method: 'get',
  path: '/migrate/tables',
  tags: ['migrate'],
  description: 'The rows of every table of the database now, to compare a run with.',
  operationId: 'readTableCounts',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: TableCountsSchema } },
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

export const getMigrateBackupsRoute = createRoute({
  method: 'get',
  path: '/migrate/backups',
  tags: ['migrate'],
  description: 'The backups taken before migrations, newest first.',
  operationId: 'readBackups',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: BackupsSchema } },
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

export const postMigrateBackupsRoute = createRoute({
  method: 'post',
  path: '/migrate/backups',
  tags: ['migrate'],
  description: 'Takes a backup of the database as it is now.',
  operationId: 'createBackup',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: BackupSchema } },
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

export const postMigrateBackupsRestoreRoute = createRoute({
  method: 'post',
  path: '/migrate/backups/restore',
  tags: ['migrate'],
  description:
    'Puts the database back as a backup has it (SQLite), and removes from the directory the\nmigration the run it undoes wrote.',
  operationId: 'restoreBackup',
  request: {
    body: { content: { 'application/json': { schema: RestoreBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrateStatusSchema } },
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

export const getMigrateMigrationsMigrationNameRoute = createRoute({
  method: 'get',
  path: '/migrate/migrations/{migrationName}',
  tags: ['migrate'],
  description:
    'The migration.sql of one migration of the directory; 404 when the directory holds none of that name.',
  operationId: 'readMigrationFile',
  request: {
    params: z.object({
      migrationName: z
        .string()
        .openapi({
          param: { name: 'migrationName', in: 'path', required: true, schema: { type: 'string' } },
        }),
    }),
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrationFileSchema } },
    },
    404: {
      description: '404 Not Found (`application/problem+json`)',
      content: { 'application/problem+json': { schema: NotFoundProblemSchema } },
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

export const postMigrateMigrationsRoute = createRoute({
  method: 'post',
  path: '/migrate/migrations',
  tags: ['migrate'],
  description:
    'Writes a migration.sql to the migrations directory, so Prisma Migrate owns it from now on.',
  operationId: 'createMigration',
  request: {
    body: {
      content: { 'application/json': { schema: CreateMigrationBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: CreatedMigrationSchema } },
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

export const postMigrateMigrationsAppliedRoute = createRoute({
  method: 'post',
  path: '/migrate/migrations/applied',
  tags: ['migrate'],
  description:
    'Records a migration as applied without running it, for one whose statements were run a step\nat a time. The database must have been migrated at least once.',
  operationId: 'markMigrationApplied',
  request: {
    body: { content: { 'application/json': { schema: MarkAppliedBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrateStatusSchema } },
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

export const postMigrateMigrationsRolledBackRoute = createRoute({
  method: 'post',
  path: '/migrate/migrations/rolled-back',
  tags: ['migrate'],
  description:
    'Records a migration as rolled back, for one that failed and left the database as it was. It\nstops counting as failed, which a database has to have before anything else reaches it.',
  operationId: 'markMigrationRolledBack',
  request: {
    body: { content: { 'application/json': { schema: MarkAppliedBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrateStatusSchema } },
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

export const getMigrateDecisionsRoute = createRoute({
  method: 'get',
  path: '/migrate/decisions',
  tags: ['migrate'],
  description: 'What has been decided on the page about the checks, as Studio kept it.',
  operationId: 'readMigrationDecisions',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrationDecisionsSchema } },
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

export const putMigrateDecisionsRoute = createRoute({
  method: 'put',
  path: '/migrate/decisions',
  tags: ['migrate'],
  description:
    'Keeps the decisions, so the same plan is made the next time the page is opened, and by\n`hekireki migrate check` and `hekireki migrate plan` from the command line.',
  operationId: 'writeMigrationDecisions',
  request: {
    body: { content: { 'application/json': { schema: DecisionsBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: MigrationDecisionsSchema } },
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

export const postMigrateDeployRoute = createRoute({
  method: 'post',
  path: '/migrate/deploy',
  tags: ['migrate'],
  description:
    'Applies every migration the database has not run yet, as `prisma migrate deploy` does.',
  operationId: 'deployMigrations',
  responses: {
    200: {
      description: 'The request has succeeded.',
      content: { 'application/json': { schema: DeployedSchema } },
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
