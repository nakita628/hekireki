import "@typespec/http";
import "@typespec/openapi";
import "@typespec/openapi3";

using Http;
using OpenAPI;

/**
 * Local API behind `hekireki studio`: the parsed Prisma schema, the schema file on disk,
 * the connected database and the Prisma language server. It listens on loopback only and
 * has no authentication, so nothing here is reachable from another origin.
 */
@service(#{ title: "Hekireki Studio API" })
@info(#{ version: "1.0.0" })
namespace HekirekiStudio;

// ---------------------------------------------------------------------------
// Scalars (every value the client sends is branded: only a validated parameter can reach a use case)
// ---------------------------------------------------------------------------

/**
 * A model name exactly as declared in the schema (`model User {}` → `User`).
 * Branded so a use case can only be asked about a model that came in through a validated path parameter.
 */
@pattern("^[A-Za-z][A-Za-z0-9_]*$")
@extension("x-error-message", "Model name must be a Prisma identifier (letters, digits and underscores, starting with a letter)")
@extension("x-brand", "ModelName")
scalar modelName extends string;

/**
 * A schema file path exactly as Studio loaded it (relative to the working directory, or absolute
 * when the schema lives outside it). Only the loaded files can be written back.
 */
@minLength(1)
@extension("x-error-message", "Path must be a non-empty string")
@extension("x-minLength-message", "Path must not be empty")
@extension("x-brand", "SchemaFilePath")
scalar schemaFilePath extends string;

/** Prisma schema source text (a whole file, or the editor buffer being typed). */
@extension("x-error-message", "Schema text must be a string")
@extension("x-brand", "SchemaText")
scalar schemaText extends string;

/** Rows to skip before the page (0-based). Defaults to 0. */
@minValue(0)
@extension("x-coerce", true)
@extension("x-prefault", 0)
@extension("x-minValue-message", "skip must be 0 or more")
@extension("x-brand", "Skip")
scalar skip extends int32;

/** Rows per page (1-1000). Defaults to 100. */
@minValue(1)
@maxValue(1000)
@extension("x-coerce", true)
@extension("x-prefault", 100)
@extension("x-minValue-message", "take must be at least 1")
@extension("x-maxValue-message", "take must be 1000 or fewer")
@extension("x-brand", "Take")
scalar take extends int32;

/** Case-insensitive text every returned row must contain in one of its columns; trimmed, empty means no filter. */
@extension("x-trim", true)
@extension("x-prefault", "")
@extension("x-brand", "Search")
scalar search extends string;

/** SQL text: one or more statements, analyzed or run as written (the Studio API is loopback-only; there is no sandbox). */
@minLength(1)
@extension("x-trim", true)
@extension("x-error-message", "SQL must be a string")
@extension("x-minLength-message", "SQL must not be empty")
@extension("x-brand", "Sql")
scalar sql extends string;

/**
 * A Prisma Client call as TypeScript would write it (`prisma.user.findMany({ take: 10 })`, or
 * `prisma.$transaction([...])` over several). Only literal arguments are read: nothing in it is
 * evaluated as code.
 */
@minLength(1)
@extension("x-trim", true)
@extension("x-error-message", "Query must be a string")
@extension("x-minLength-message", "Query must not be empty")
@extension("x-brand", "ClientQuery")
scalar clientQuery extends string;

/** A 0-based offset into the query text, in UTF-16 code units, as the editor counts. */
@minValue(0)
@extension("x-minValue-message", "offset must be 0 or more")
@extension("x-brand", "QueryOffset")
scalar queryOffset extends int32;

/** A 0-based line number in the editor buffer. */
@minValue(0)
@extension("x-minValue-message", "line must be 0 or more")
@extension("x-brand", "Line")
scalar line extends int32;

/** A 0-based column (UTF-16 code unit offset) in the editor buffer. */
@minValue(0)
@extension("x-minValue-message", "character must be 0 or more")
@extension("x-brand", "Character")
scalar character extends int32;

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** The SQL dialect of the connected database. */
union Dialect {
  /** PostgreSQL, through the `pg` package installed in the project */
  postgresql: "postgresql",

  /** MySQL / MariaDB, through the `mysql2` package installed in the project */
  mysql: "mysql",

  /** SQLite, through the `node:sqlite` module built into Node.js */
  sqlite: "sqlite",
}

/** Where the database URL was found, in precedence order. */
union UrlSource {
  /** The `--url` flag of `hekireki studio` */
  flag: "flag",

  /** `url` in `hekireki.config.ts` */
  hekireki: "hekireki",

  /** `datasource.url` in `prisma.config.ts` or the schema, or the variable it names */
  prisma: "prisma",

  /** `DATABASE_URL` in the environment or `.env` */
  env: "env",
}

/** What a field holds, as Prisma classifies it. */
union FieldKind {
  /** A scalar such as `String`, `Int` or `DateTime` */
  `scalar`: "scalar",

  /** A relation to another model */
  object: "object",

  /** A value of a declared `enum` */
  enumeration: "enum",

  /** A database type Prisma cannot represent (`Unsupported("...")`) */
  unsupported: "unsupported",
}

/** The kind of index a `@@` attribute declares. */
union IndexType {
  /** `@@id` — the composite primary key */
  id: "id",

  /** `@@unique` */
  unique: "unique",

  /** `@@index` */
  normal: "normal",

  /** `@@fulltext` */
  fulltext: "fulltext",
}

/** How many rows one end of a relation points at. */
union Cardinality {
  /** At most one (optional relation) */
  zeroOne: "zero-one",

  /** Exactly one */
  one: "one",

  /** Any number, possibly none (optional list) */
  zeroMany: "zero-many",

  /** Any number */
  many: "many",
}

/** Where a relation came from. */
union RelationOrigin {
  /** A `@relation(fields, references)` foreign key in the schema */
  inferred: "inferred",

  /** A `/// @relation Model.field Model.field one-to-many` doc annotation without a physical key */
  annotated: "annotated",

  /** Prisma's implicit many-to-many join table between two list fields */
  implicitManyToMany: "implicit-many-to-many",
}

/** How serious a diagnostic of the Prisma language server is (LSP `DiagnosticSeverity`). */
union Severity {
  /** The schema does not parse until this is fixed */
  error: "error",

  /** The schema parses, but Prisma advises a change */
  warning: "warning",

  /** A note about the schema */
  information: "information",

  /** A hint the editor shows faintly, such as an `@ignore`d field */
  hint: "hint",
}

/** What kind of statement was analyzed. */
union StatementKind {
  select: "select",
  insert: "insert",
  update: "update",
  `delete`: "delete",

  /** DDL, PRAGMA, EXPLAIN and the like: run as written, not drawn */
  other: "other",

  /** Text the parser could not read; `diagnostics` says where */
  invalid: "invalid",
}

/** What a node of the data-flow graph stands for. */
union NodeKind {
  /** A table read from the schema */
  table: "table",

  /** A common table expression (`WITH name AS (...)`) */
  cte: "cte",

  /** A subquery in FROM, named by its alias */
  subquery: "subquery",

  /** A `VALUES` list */
  values: "values",

  /** A table-valued function in FROM */
  `function`: "function",

  /** A join of the two inputs */
  join: "join",

  /** `WHERE` */
  filter: "filter",

  /** `GROUP BY`, or an aggregate over the whole result */
  aggregate: "aggregate",

  /** `HAVING` */
  having: "having",

  /** The `SELECT` list: what comes out */
  project: "project",

  /** `DISTINCT` */
  distinct: "distinct",

  /** `ORDER BY` */
  sort: "sort",

  /** `LIMIT` / `OFFSET` */
  limit: "limit",

  /** `UNION`, `INTERSECT` or `EXCEPT` */
  `union`: "union",

  /** The `INSERT` target */
  insert: "insert",

  /** The `UPDATE` target */
  update: "update",

  /** The `DELETE` target */
  `delete`: "delete",

  /** `RETURNING` */
  returning: "returning",
}

/** How rows travel along an edge. */
union EdgeKind {
  /** The rows of the source feed the target */
  flow: "flow",

  /** The source is a subquery evaluated inside an expression of the target */
  lookup: "lookup",
}

/** How serious a problem the analysis found is. */
union SqlSeverity {
  /** The statement cannot run as written */
  error: "error",

  /** The statement runs, but something in it looks wrong */
  warning: "warning",

  /** A note about the statement */
  info: "info",
}

// ---------------------------------------------------------------------------
// Schema snapshot
// ---------------------------------------------------------------------------

/** One schema file on disk, as Studio read it. */
@example(#{
  path: "prisma/schema.prisma",
  content: "model User {\n  id Int @id\n}\n",
})
model SchemaFile {
  /** The file path as Studio loaded it (the value to send back as `FileWrite.path`) */
  path: string;

  /** The whole file content */
  content: string;
}

/** Where a block starts in the schema files. */
@example(#{ file: "prisma/schema.prisma", line: 12 })
model Location {
  /** The file that declares the block */
  file: string;

  /** The 1-based line of the `model` / `enum` keyword */
  line: int32;
}

/** The `@relation(...)` attribute of a relation field. */
@example(#{
  name: "PostToUser",
  fromFields: #["authorId"],
  toFields: #["id"],
  onDelete: "Cascade",
  onUpdate: null,
})
model FieldRelation {
  /** The relation name (`@relation("name")`, or the one Prisma derived) */
  name: string;

  /** The fields on this model that hold the foreign key */
  fromFields: string[];

  /** The fields on the other model the key references */
  toFields: string[];

  /** The `onDelete` referential action, when declared */
  onDelete: string | null;

  /** The `onUpdate` referential action, when declared */
  onUpdate: string | null;
}

/** One field of a model. */
@example(#{
  name: "authorId",
  dbName: "author_id",
  kind: "scalar",
  type: "Int",
  isList: false,
  isRequired: true,
  isId: false,
  isUnique: false,
  isUpdatedAt: false,
  isForeignKey: true,
  default: null,
  nativeType: null,
  documentation: "The author of the post",
  annotations: #["@z.int().positive()"],
  relation: null,
  attributes: #["@map(\"author_id\")"],
})
model Field {
  /** The field name */
  name: string;

  /** The column name from `@map`, when it differs */
  dbName: string | null;

  /** What the field holds */
  kind: FieldKind;

  /** The Prisma type: a scalar, a model or an enum name */
  type: string;

  /** Whether the field is a list (`String[]`) */
  isList: boolean;

  /** Whether the field is required (no `?`) */
  isRequired: boolean;

  /** Whether the field is `@id` */
  isId: boolean;

  /** Whether the field is `@unique` */
  isUnique: boolean;

  /** Whether the field is `@updatedAt` */
  isUpdatedAt: boolean;

  /** Whether the field holds the foreign key of a relation on this model */
  isForeignKey: boolean;

  /** The `@default(...)` value rendered as written, when declared */
  default: string | null;

  /** The `@db.*` native type rendered as written, when declared */
  nativeType: string | null;

  /** The `///` doc comment with hekireki annotations stripped */
  documentation: string | null;

  /** The hekireki annotation lines (`@z.*`, `@v.*`, ...) found in the doc comment */
  annotations: string[];

  /** The `@relation(...)` attribute of a relation field */
  relation: FieldRelation | null;

  /** Every attribute rendered as written (`@id`, `@default(now())`, `@map("...")`, ...) */
  attributes: string[];
}

/** A `@@id`, `@@unique`, `@@index` or `@@fulltext` attribute of a model. */
@example(#{
  type: "unique",
  name: null,
  dbName: "users_email_key",
  fields: #["email"],
  attribute: "@@unique([email], map: \"users_email_key\")",
})
model Index {
  /** The kind of index */
  type: IndexType;

  /** The Prisma-side index name, when declared */
  name: string | null;

  /** The database-side index name (`map`), when declared */
  dbName: string | null;

  /** The fields the index covers, in order */
  fields: string[];

  /** The attribute rendered as written */
  attribute: string;
}

/** One model of the schema. */
@example(#{
  name: "User",
  dbName: "users",
  documentation: "A registered account",
  annotations: #[],
  fields: #[
    #{
      name: "id",
      dbName: null,
      kind: "scalar",
      type: "Int",
      isList: false,
      isRequired: true,
      isId: true,
      isUnique: false,
      isUpdatedAt: false,
      isForeignKey: false,
      default: "autoincrement()",
      nativeType: null,
      documentation: null,
      annotations: #[],
      relation: null,
      attributes: #["@id", "@default(autoincrement())"],
    }
  ],
  primaryKey: null,
  indexes: #[],
  attributes: #["@@map(\"users\")"],
  location: #{ file: "prisma/schema.prisma", line: 12 },
})
model Model {
  /** The model name */
  name: string;

  /** The table name from `@@map`, when it differs */
  dbName: string | null;

  /** The `///` doc comment with hekireki annotations stripped */
  documentation: string | null;

  /** The hekireki annotation lines found in the doc comment */
  annotations: string[];

  /** The fields in declaration order */
  fields: Field[];

  /** The `@@id` fields, when the primary key is composite */
  primaryKey: string[] | null;

  /** The `@@` index attributes */
  indexes: Index[];

  /** Every `@@` attribute rendered as written */
  attributes: string[];

  /** Where the block starts (null when it could not be located) */
  location: Location | null;
}

/** One member of an enum. */
@example(#{ name: "ADMIN", dbName: "admin" })
model EnumValue {
  /** The member name */
  name: string;

  /** The stored value from `@map`, when it differs */
  dbName: string | null;
}

/** One enum of the schema. */
@example(#{
  name: "Role",
  dbName: null,
  documentation: "What an account may do",
  values: #[#{ name: "ADMIN", dbName: "admin" }, #{ name: "VIEWER", dbName: null }],
  location: #{ file: "prisma/schema.prisma", line: 40 },
})
model Enum {
  /** The enum name */
  name: string;

  /** The type name from `@@map`, when it differs */
  dbName: string | null;

  /** The `///` doc comment */
  documentation: string | null;

  /** The members in declaration order */
  values: EnumValue[];

  /** Where the block starts (null when it could not be located) */
  location: Location | null;
}

/** One end of a relation. */
@example(#{ `model`: "Post", field: "authorId", cardinality: "many" })
model RelationEnd {
  /** The model on this end */
  `model`: string;

  /** The field on this end (the key field, or the list field of an implicit many-to-many) */
  field: string;

  /** How many rows this end points at */
  cardinality: Cardinality;
}

/** A relation between two models, drawn as one edge in the ER diagram. */
@example(#{
  id: "User.id->Post.authorId",
  name: "PostToUser",
  origin: "inferred",
  from: #{ `model`: "User", field: "id", cardinality: "one" },
  to: #{ `model`: "Post", field: "authorId", cardinality: "many" },
  onDelete: "Cascade",
  onUpdate: null,
})
model Relation {
  /** A stable id built from both ends (`From.field->To.field`) */
  id: string;

  /** The relation name, when one is declared or derived */
  name: string | null;

  /** Where the relation came from */
  origin: RelationOrigin;

  /** The referenced end */
  from: RelationEnd;

  /** The referencing end */
  to: RelationEnd;

  /** The `onDelete` referential action, when declared */
  onDelete: string | null;

  /** The `onUpdate` referential action, when declared */
  onUpdate: string | null;
}

/** The parsed Prisma schema as the UI consumes it. */
@example(#{
  files: #[#{ path: "prisma/schema.prisma", content: "model User {\n  id Int @id\n}\n" }],
  provider: "postgresql",
  models: #[],
  enums: #[],
  relations: #[],
})
model Schema {
  /** The files the schema was parsed from */
  files: SchemaFile[];

  /** The `datasource` provider, when one is declared */
  provider: string | null;

  /** Every model in declaration order */
  models: Model[];

  /** Every enum in declaration order */
  enums: Enum[];

  /** Every relation between the models */
  relations: Relation[];
}

/** One diagnostic the Prisma language server reports for a file on disk. */
@example(#{
  path: "prisma/schema.prisma",
  range: #{ start: #{ line: 1, character: 5 }, end: #{ line: 1, character: 9 } },
  message: "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  severity: "error",
})
model FileDiagnostic {
  /** The file, as Studio loaded it */
  path: string;

  /** Where it is (0-based, end exclusive) */
  range: LspRange;

  /** The Prisma message */
  message: string;

  /** How serious it is */
  severity: Severity;
}

/**
 * The latest parse result. `schema` is the last schema that parsed (null until one does),
 * `error` the current Prisma error and `diagnostics` the same errors as the language server
 * places them, so a broken edit never blanks the UI. `files` always reflects the disk, even
 * while the schema is broken.
 */
@example(#{
  schema: null,
  error: "error: Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  diagnostics: #[
    #{
      path: "prisma/schema.prisma",
      range: #{ start: #{ line: 1, character: 5 }, end: #{ line: 1, character: 9 } },
      message: "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
      severity: "error",
    }
  ],
  updatedAt: utcDateTime.fromISO("2026-09-02T00:00:00.000Z"),
  files: #[#{ path: "prisma/schema.prisma", content: "model User {\n  id Nope @id\n}\n" }],
})
@extension("x-brand", "Snapshot")
model Snapshot {
  /** The last schema that parsed, or null before the first successful parse */
  schema: Schema | null;

  /** The Prisma error of the latest parse as the engine printed it, or null when it succeeded */
  error: string | null;

  /** Every diagnostic the language server reports for the files on disk; empty when they parse */
  diagnostics: FileDiagnostic[];

  /** When the files were last read (ISO 8601); the event stream announces every change of it */
  updatedAt: utcDateTime;

  /** The files on disk as of the latest read */
  files: SchemaFile[];
}

/** A schema file to write back. Only a file Studio loaded can be written. */
@example(#{
  path: "prisma/schema.prisma",
  content: "model User {\n  id Int @id\n}\n",
})
model FileWrite {
  /** The file path exactly as it appears in `Snapshot.files` */
  path: schemaFilePath;

  /** The whole new file content */
  content: schemaText;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** The database connection as the sidebar shows it. */
@example(#{
  connected: true,
  dialect: "sqlite",
  url: "file:./dev.db",
  source: "env",
  error: null,
})
@extension("x-brand", "DbStatus")
model DbStatus {
  /** Whether a driver is open */
  connected: boolean;

  /** The dialect of the open driver */
  dialect: Dialect | null;

  /** The connection URL with its password redacted */
  url: string | null;

  /** Where the URL was found */
  source: UrlSource | null;

  /** Why no database is connected, when it is not */
  error: string | null;
}

/** Row counts keyed by model name. Models whose table could not be counted are left out. */
@example(#{ counts: #{ User: 3, Post: 12 } })
@extension("x-brand", "Counts")
model Counts {
  /** Model name → number of rows */
  counts: Record<int32>;
}

/**
 * One row keyed by Prisma field name (not column name). Values are what JSON can carry: dates
 * are ISO strings, bigints are strings, JSON columns are strings.
 */
@example(#{ id: 1, email: "ann@example.com", active: true, deletedAt: null })
model Row is Record<string | float64 | boolean | null>;

/** The paging and search parameters of a rows request. */
model RowsQuery {
  /** Rows to skip before the page */
  @query skip: skip;

  /** Rows per page */
  @query take: take;

  /** Text every returned row must contain */
  @query search?: search;
}

/** One page of a model's table. */
@example(#{
  rows: #[#{ id: 1, email: "ann@example.com", active: true, deletedAt: null }],
  total: 1,
  skip: 0,
  take: 100,
  key: #["id"],
  columns: #["id", "email", "active", "deletedAt"],
})
@extension("x-brand", "Rows")
model Rows {
  /** The rows of the page */
  rows: Row[];

  /** How many rows match the search in total */
  total: int32;

  /** The skip the page was read with */
  skip: int32;

  /** The take the page was read with */
  take: int32;

  /** The fields that identify a row (the primary key, else the unique fields) */
  key: string[];

  /** The fields the table has, in declaration order */
  columns: string[];
}

/** A row to insert. */
@example(#{ values: #{ email: "ann@example.com" } })
model InsertBody {
  /** Field values for the new row; omitted fields take their defaults */
  values: Row;
}

/** A change to one row. */
@example(#{ where: #{ id: 1 }, values: #{ email: "ann@example.org" } })
model UpdateBody {
  /** The key fields of the row to change */
  where: Row;

  /** The fields to set */
  values: Row;
}

/** A row to delete. */
@example(#{ where: #{ id: 1 } })
model DeleteBody {
  /** The key fields of the row to delete */
  where: Row;
}

/** How many rows a write touched. */
@example(#{ affected: 1 })
@extension("x-brand", "Affected")
model Affected {
  /** The driver's affected-row count */
  affected: int32;
}

/** A statement to run. */
@example(#{ sql: "SELECT id, email FROM users LIMIT 10" })
model SqlBody {
  /** The statements; several are run one by one and the result belongs to the last */
  sql: sql;

  /** The values bound to the placeholders, in order; omitted means none */
  params?: (string | float64 | boolean | null)[];
}

/** What a statement returned. */
@example(#{
  columns: #["id", "email"],
  rows: #[#{ id: 1, email: "ann@example.com" }],
  rowCount: 1,
  durationMs: 0.4,
})
@extension("x-brand", "SqlResult")
model SqlResult {
  /** The column names of the result set (empty for a write) */
  columns: string[];

  /** The rows of the result set keyed by column name (empty for a write) */
  rows: Row[];

  /** Rows returned, or rows affected for a write */
  rowCount: int32;

  /** Wall time of the statement in milliseconds */
  durationMs: float64;
}

/** Text to analyze. */
@example(#{ sql: "SELECT id, email FROM users WHERE id = ?" })
model AnalyzeBody {
  /** The statements */
  sql: sql;
}

/** Character offsets into the statement text, end exclusive. */
@example(#{ start: 7, end: 12 })
model TextRange {
  /** The first character */
  start: int32;

  /** One past the last character */
  end: int32;
}

/** A column a node produces. */
@example(#{ name: "email", dataType: "TEXT", used: true })
model NodeColumn {
  /** The column name */
  name: string;

  /** The declared type, when known */
  dataType: string | null;

  /** Whether the statement reads the column (for a table), or always true for a result */
  used: boolean;
}

/** A node of the data-flow graph. */
@example(#{
  id: "n3",
  kind: "filter",
  label: "WHERE",
  details: #["u.id = ?"],
  range: #{ start: 40, end: 48 },
  scope: "main",
  columns: #[],
})
model GraphNode {
  /** The node id, unique within the statement */
  id: string;

  /** What the node stands for */
  kind: NodeKind;

  /** The caption (`users AS u`, `LEFT JOIN`, `WHERE`) */
  label: string;

  /** Lines under the caption: the condition, the grouped keys, the column names */
  details: string[];

  /** Where the node's clause sits in the text, when it has one */
  range: TextRange | null;

  /** `main`, or the CTE / subquery alias the node belongs to */
  scope: string;

  /** The columns the node produces (tables, CTEs, subqueries and projections) */
  columns: NodeColumn[];
}

/** An edge of the data-flow graph. */
@example(#{ id: "n1->n3:0", source: "n1", target: "n3", label: null, kind: "flow" })
model GraphEdge {
  /** The edge id, unique within the statement */
  id: string;

  /** The node rows come from */
  source: string;

  /** The node rows go to */
  target: string;

  /** A caption (`optional` for the outer side of a join, `scalar` for a scalar subquery) */
  label: string | null;

  /** How rows travel */
  kind: EdgeKind;
}

/** A base-table column an output column derives from. */
@example(#{ table: "users", column: "email" })
model ColumnSource {
  /** The base table */
  table: string;

  /** The column of that table */
  column: string;
}

/** A column of the result, with its lineage and type. */
@example(#{
  name: "email",
  expression: "u.email",
  dataType: "TEXT",
  tsType: "string",
  nullable: true,
  sources: #[#{ table: "users", column: "email" }],
})
model OutputColumn {
  /** The name a driver keys the row with */
  name: string;

  /** The expression as written */
  expression: string;

  /** The declared type, when known */
  dataType: string | null;

  /** The TypeScript type of the value */
  tsType: string;

  /** Whether NULL can come back; null when the analysis cannot tell */
  nullable: boolean | null;

  /** The base-table columns the value derives from */
  sources: ColumnSource[];
}

/** A table the statement reads or writes. */
@example(#{
  nodeId: "n1",
  name: "users",
  `alias`: "u",
  scope: "main",
  known: true,
  columnsUsed: #["id", "email"],
  range: #{ start: 20, end: 25 },
})
model TableRef {
  /** The graph node of this reference */
  nodeId: string;

  /** The table name as written */
  name: string;

  /** The alias, when one was given */
  `alias`: string | null;

  /** `main`, or the CTE / subquery alias the reference sits in */
  scope: string;

  /** Whether the schema has the table */
  known: boolean;

  /** The columns the statement reads from this reference */
  columnsUsed: string[];

  /** Where the name sits in the text */
  range: TextRange;
}

/** A placeholder and the type of what it stands beside. */
@example(#{
  index: 1,
  placeholder: "?",
  dataType: "INTEGER",
  tsType: "number",
  nullable: false,
  context: "u.id = ?",
})
model SqlParameter {
  /** The bind position (1-based), or the `$n` number */
  index: int32;

  /** The placeholder as written (`?`, `$1`, `:name`) */
  placeholder: string;

  /** The declared type of the column it is compared with, when known */
  dataType: string | null;

  /** The TypeScript type a value should have */
  tsType: string;

  /** Whether NULL is a valid value; null when the analysis cannot tell */
  nullable: boolean | null;

  /** The expression the placeholder sits in */
  context: string;
}

/** A problem found in the statement. */
@example(#{
  severity: "warning",
  message: "Unknown column \"nmae\"",
  range: #{ start: 7, end: 11 },
})
model SqlDiagnostic {
  /** How serious it is */
  severity: SqlSeverity;

  /** What is wrong */
  message: string;

  /** Where, when the analysis can point at it */
  range: TextRange | null;
}

/** The analysis of one statement. */
model StatementAnalysis {
  /** What kind of statement it is */
  kind: StatementKind;

  /** The statement text */
  text: string;

  /** Where the statement sits in the submitted text */
  range: TextRange;

  /** The nodes of the data-flow graph */
  nodes: GraphNode[];

  /** The edges of the data-flow graph */
  edges: GraphEdge[];

  /** Every table the statement touches */
  tables: TableRef[];

  /** The columns of the result (empty for a write without RETURNING) */
  columns: OutputColumn[];

  /** The placeholders, in bind order */
  parameters: SqlParameter[];

  /** What was found wrong */
  diagnostics: SqlDiagnostic[];

  /** The row type as TypeScript (`{ id: number; email: string | null }`) */
  rowType: string;

  /** The parameter tuple (or object, for named placeholders) as TypeScript */
  paramsType: string;
}

/** The analysis of every statement in the text. */
@extension("x-brand", "Analysis")
model Analysis {
  /** One entry per statement, in order */
  statements: StatementAnalysis[];
}

/** One step of the execution plan, flattened; `parent` rebuilds the tree. */
@example(#{
  id: "3",
  parent: null,
  label: "SCAN users",
  detail: null,
  cost: null,
  rows: null,
})
model PlanNode {
  /** The step id, unique within the plan */
  id: string;

  /** The id of the step this one feeds, or null for a root */
  parent: string | null;

  /** What the step does (`SCAN users`, `Seq Scan on users`, `Hash Join`) */
  label: string;

  /** The rest of what the database said about the step */
  detail: string | null;

  /** The estimated cost, when the database reports one */
  cost: float64 | null;

  /** The estimated (or, with ANALYZE, actual) row count, when reported */
  rows: float64 | null;
}

/** The execution plan of a statement. */
@example(#{ dialect: "sqlite", nodes: #[], raw: "" })
@extension("x-brand", "Plan")
model Plan {
  /** The dialect that produced the plan */
  dialect: Dialect;

  /** The steps, parents before children */
  nodes: PlanNode[];

  /** The plan as the database printed it */
  raw: string;
}

// ---------------------------------------------------------------------------
// Prisma Client
// ---------------------------------------------------------------------------

/** Whether the project's Prisma Client can be loaded, and whether its types can be read. */
@example(#{
  available: true,
  source: "generated/client",
  error: null,
  typescript: "5.9.3",
  typesError: null,
})
@extension("x-brand", "ClientStatus")
model ClientStatus {
  /** Whether the client is loaded and connected through the project's driver adapter */
  available: boolean;

  /** Where the client was loaded from: the generator output, or `@prisma/client` */
  source: string | null;

  /** Why the client could not be loaded, when it could not */
  error: string | null;

  /** The version of the project's TypeScript the editor completes with, or null without one */
  typescript: string | null;

  /** Why the editor cannot complete against the client's types, when it cannot */
  typesError: string | null;
}

/** A position in a query, for completion, hovers and signature help. */
@example(#{ query: "prisma.user.findMany({ wh", offset: 25 })
model ClientPositionBody {
  /** The query text as typed so far */
  query: clientQuery;

  /** Where the cursor is */
  offset: queryOffset;
}

/** One completion TypeScript offers at a position. */
@example(#{ label: "where", kind: "property", sortText: "11", insertText: null })
model ClientCompletionItem {
  /** What is inserted, and shown */
  label: string;

  /** The TypeScript element kind (`property`, `method`, `keyword`, ...) */
  kind: string;

  /** The order TypeScript ranks the item in */
  sortText: string;

  /** The text to insert when it differs from the label (a quoted key), else null */
  insertText: string | null;
}

/** The completions at a position. */
@example(#{ items: #[#{ label: "where", kind: "property", sortText: "11", insertText: null }] })
@extension("x-brand", "ClientCompletions")
model ClientCompletions {
  /** The items, unordered; `sortText` orders them */
  items: ClientCompletionItem[];
}

/** One completion to say more about. */
@example(#{ query: "prisma.user.findMany({ wh", offset: 25, name: "where" })
model ClientCompletionDetailBody {
  /** The query text as typed so far */
  query: clientQuery;

  /** Where the cursor is */
  offset: queryOffset;

  /** The label of the item */
  name: string;
}

/** The type and the documentation of one completion. */
@example(#{ detail: "(property) where?: UserWhereInput", documentation: null })
@extension("x-brand", "ClientCompletionDetail")
model ClientCompletionDetail {
  /** The item's signature as TypeScript prints it */
  detail: string | null;

  /** Its doc comment, as Markdown */
  documentation: string | null;
}

/** What TypeScript says about the symbol at a position. */
@example(#{ contents: "```typescript\n(property) take?: number\n```", range: #{ start: 22, end: 26 } })
@extension("x-brand", "ClientHover")
model ClientHover {
  /** The type and documentation as Markdown, or null when nothing is there */
  contents: string | null;

  /** The symbol the hover is about */
  range: TextRange | null;
}

/** One parameter of a signature. */
@example(#{ label: "args?: UserFindManyArgs", documentation: null })
model ClientSignatureParameter {
  /** The parameter as TypeScript prints it */
  label: string;

  /** Its doc comment */
  documentation: string | null;
}

/** One overload of the call under the cursor. */
@example(#{
  label: "findMany(args?: UserFindManyArgs): PrismaPromise<User[]>",
  documentation: "Find zero or more Users that matches the filter.",
  parameters: #[#{ label: "args?: UserFindManyArgs", documentation: null }],
})
model ClientSignature {
  /** The whole signature */
  label: string;

  /** Its doc comment */
  documentation: string | null;

  /** The parameters, in order */
  parameters: ClientSignatureParameter[];
}

/** The signatures of the call the cursor is inside, and which one and which parameter is active. */
@example(#{ signatures: #[], activeSignature: 0, activeParameter: 0 })
@extension("x-brand", "ClientSignatureHelp")
model ClientSignatureHelp {
  /** The overloads; empty when the cursor is not inside a call */
  signatures: ClientSignature[];

  /** The overload the arguments so far match */
  activeSignature: int32;

  /** The parameter the cursor is on */
  activeParameter: int32;
}

/** The query laid out as the repository's TypeScript formatter (oxfmt) writes it. */
@example(#{ text: "prisma.user.findMany({ take: 10 })" })
@extension("x-brand", "ClientFormatted")
model ClientFormatted {
  /** The whole text, formatted; the same text when it already is */
  text: string;
}

/** How serious a TypeScript diagnostic is. */
union TypeSeverity {
  error: "error",
  warning: "warning",
  info: "info",
}

/** One problem TypeScript finds in the query. */
@example(#{ message: "Object literal may only specify known properties.", severity: "error", range: #{ start: 22, end: 26 } })
model ClientTypeDiagnostic {
  /** What is wrong */
  message: string;

  /** How serious it is */
  severity: TypeSeverity;

  /** Where */
  range: TextRange;
}

/** What TypeScript finds wrong with the query against the client's types. */
@example(#{ diagnostics: #[] })
@extension("x-brand", "ClientTypeDiagnostics")
model ClientTypeDiagnostics {
  /** The problems, in order of position */
  diagnostics: ClientTypeDiagnostic[];
}

/** A Prisma Client call to analyze or run. */
@example(#{ query: "prisma.user.findMany({ where: { email: { contains: \"ann\" } }, take: 10 })" })
model ClientQueryBody {
  /** The call, as TypeScript would write it */
  query: clientQuery;
}

/** One model operation the query makes. */
@example(#{ `model`: "User", operation: "findMany", write: false, range: #{ start: 0, end: 22 } })
model ClientCall {
  /** The model the delegate stands for (`prisma.user` → `User`) */
  `model`: string;

  /** The operation called on it (`findMany`, `create`, ...) */
  operation: string;

  /** Whether the operation writes */
  write: boolean;

  /** Where the call sits in the text */
  range: TextRange;
}

/** A problem that keeps the query from being run. */
@example(#{ message: "Unknown model delegate \"usr\"", range: #{ start: 7, end: 10 } })
model ClientDiagnostic {
  /** What is wrong */
  message: string;

  /** Where */
  range: TextRange;
}

/** A model the query touches, with the fields its arguments name. */
@example(#{ `model`: "User", fields: #["email", "posts"] })
model ClientTouchedModel {
  /** The model, as the schema declares it */
  `model`: string;

  /** The fields of the model the arguments name: scalars they filter, select, order or write, relations they follow */
  fields: string[];
}

/** What the query text says, read without running it. */
@example(#{
  calls: #[#{ `model`: "User", operation: "findMany", write: false, range: #{ start: 0, end: 22 } }],
  transaction: false,
  touched: #[#{ `model`: "User", fields: #["email"] }],
  diagnostics: #[],
})
@extension("x-brand", "ClientAnalysis")
model ClientAnalysis {
  /** The calls, in order (empty when the text does not parse) */
  calls: ClientCall[];

  /** Whether the calls are batched in one `$transaction` */
  transaction: boolean;

  /** The models the calls are made on and the ones their relations reach, in the order they are reached */
  touched: ClientTouchedModel[];

  /** What keeps the query from being run (empty when it can be) */
  diagnostics: ClientDiagnostic[];
}

/** One SQL statement the Prisma Client sent to the database. */
@example(#{
  sql: "SELECT `main`.`User`.`id` FROM `main`.`User` LIMIT ? OFFSET ?",
  formatted: "SELECT\n  `main`.`User`.`id`\nFROM `main`.`User`\nLIMIT ?\nOFFSET ?",
  params: #["10", "0"],
  durationMs: 0.4,
})
model ClientSqlQuery {
  /** The statement as the driver received it, from Prisma Client's own query event */
  sql: string;

  /** The same statement laid out a clause per line for reading: only its whitespace differs */
  formatted: string;

  /** The values bound to its placeholders, in order */
  params: (string | float64 | boolean | null)[];

  /** How long the database took, in milliseconds */
  durationMs: float64;
}

/** What a Prisma Client call returned, with the SQL it took. */
@example(#{
  result: #[#{ id: 1, email: "ann@example.com" }],
  rowCount: 1,
  truncated: false,
  queries: #[
    #{
      sql: "SELECT `main`.`User`.`id` FROM `main`.`User` LIMIT ? OFFSET ?",
      formatted: "SELECT\n  `main`.`User`.`id`\nFROM `main`.`User`\nLIMIT ?\nOFFSET ?",
      params: #["10", "0"],
      durationMs: 0.4,
    }
  ],
  durationMs: 3.2,
})
@extension("x-brand", "ClientResult")
model ClientResult {
  /**
   * The value the call resolved to, as JSON: dates are ISO strings, bigints and decimals are
   * strings, bytes are base64. A `$transaction` resolves to the array of its results.
   */
  result: unknown;

  /** The length of the result, when it is an array */
  rowCount: int32 | null;

  /** Whether only the first rows of the array are in `result` */
  truncated: boolean;

  /** The statements the client sent, in order */
  queries: ClientSqlQuery[];

  /** Wall time of the whole call in milliseconds */
  durationMs: float64;
}

/** The SQL a read-only call sends, from running it while it is typed. */
@example(#{
  queries: #[
    #{
      sql: "SELECT `main`.`User`.`id` FROM `main`.`User` LIMIT ? OFFSET ?",
      formatted: "SELECT\n  `main`.`User`.`id`\nFROM `main`.`User`\nLIMIT ?\nOFFSET ?",
      params: #["10", "0"],
      durationMs: 0.4,
    }
  ],
  durationMs: 3.2,
})
@extension("x-brand", "ClientPreview")
model ClientPreview {
  /** The statements the client sent, in order */
  queries: ClientSqlQuery[];

  /** Wall time of the whole call in milliseconds */
  durationMs: float64;
}

// ---------------------------------------------------------------------------
// Prisma language server
// ---------------------------------------------------------------------------
//
// Every shape below is the LSP one the Prisma language server hands back (positions are 0-based,
// ranges end-exclusive), with file URIs replaced by the paths Studio loaded; the editor turns
// them into Monaco's own without further interpretation.

/** A 0-based position in a document, as LSP counts it. */
@example(#{ line: 4, character: 6 })
model LspPosition {
  /** The line */
  line: line;

  /** The column */
  character: character;
}

/** A range between two positions, end exclusive. */
@example(#{ start: #{ line: 4, character: 6 }, end: #{ line: 4, character: 10 } })
model LspRange {
  /** Where the range starts */
  start: LspPosition;

  /** Where the range ends */
  end: LspPosition;
}

/** A place in one of the schema files. */
@example(#{
  path: "prisma/schema.prisma",
  range: #{ start: #{ line: 10, character: 0 }, end: #{ line: 14, character: 1 } },
  selection: #{ start: #{ line: 10, character: 6 }, end: #{ line: 10, character: 10 } },
})
model LspLocation {
  /** The file, as Studio loaded it */
  path: string;

  /** The whole declaration */
  range: LspRange;

  /** The name inside it, to put the cursor on */
  selection: LspRange;
}

/** One place a symbol is used. */
@example(#{
  path: "prisma/schema.prisma",
  range: #{ start: #{ line: 21, character: 9 }, end: #{ line: 21, character: 13 } },
})
model LspReference {
  /** The file, as Studio loaded it */
  path: string;

  /** The word that refers to the symbol */
  range: LspRange;
}

/** One replacement in a document. */
@example(#{ range: #{ start: #{ line: 4, character: 6 }, end: #{ line: 4, character: 10 } }, newText: "Account" })
model LspTextEdit {
  /** What to replace */
  range: LspRange;

  /** The replacement */
  newText: string;
}

/** The edits of one file. */
@example(#{ path: "prisma/schema.prisma", edits: #[] })
model LspFileEdit {
  /** The file, as Studio loaded it */
  path: string;

  /** The replacements, in document order */
  edits: LspTextEdit[];
}

/** One diagnostic the Prisma language server reports, positioned as LSP does. */
@example(#{
  range: #{ start: #{ line: 7, character: 7 }, end: #{ line: 7, character: 8 } },
  message: "Type \"R\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  severity: "error",
})
model LspDiagnostic {
  /** Where it is */
  range: LspRange;

  /** The Prisma message */
  message: string;

  /** How serious it is */
  severity: Severity;
}

/** A block of a schema file, as the language server's document outline lists it. */
@example(#{
  name: "User",
  kind: 5,
  range: #{ start: #{ line: 4, character: 0 }, end: #{ line: 9, character: 1 } },
  selectionRange: #{ start: #{ line: 4, character: 6 }, end: #{ line: 4, character: 10 } },
})
model LspDocumentSymbol {
  /** The declared name */
  name: string;

  /** The LSP `SymbolKind`: 5 = model or view, 10 = enum, 11 = composite type, 23 = datasource, 12 = generator */
  kind: int32;

  /** The whole block */
  range: LspRange;

  /** The name inside the block header */
  selectionRange: LspRange;
}

/** Schema text and, when it belongs to a loaded file, that file, so the other loaded files are seen. */
@example(#{ text: "model User {\nid Int @id\n}\n" })
model TextBody {
  /** The text as typed */
  text: schemaText;

  /** The file the text belongs to, as Studio loaded it; the first file when omitted */
  path?: string;
}

/** The edits the Prisma formatter makes; the editor applies them as a minimal diff. */
@example(#{
  edits: #[
    #{
      range: #{ start: #{ line: 0, character: 0 }, end: #{ line: 3, character: 0 } },
      newText: "model User {\n  id Int @id\n}\n",
    }
  ],
})
@extension("x-brand", "Formatted")
model Formatted {
  /** The replacements that lay the text out as the Prisma formatter does; empty when it already is */
  edits: LspTextEdit[];
}

/** The buffer being edited, validated together with the other loaded files. */
@example(#{
  path: "prisma/schema.prisma",
  text: "model User {\n  id Nope @id\n}\n",
})
model LintBody {
  /** The loaded file the text replaces */
  path: schemaFilePath;

  /** The text being edited */
  text: schemaText;
}

/** The diagnostics of one file. */
@example(#{ diagnostics: #[] })
@extension("x-brand", "Diagnostics")
model Diagnostics {
  /** Every diagnostic the language server reported for the file */
  diagnostics: LspDiagnostic[];
}

/** The blocks of one file in declaration order, as the editor outline shows them. */
@example(#{ symbols: #[] })
@extension("x-brand", "Symbols")
model Symbols {
  /** Every block of the text */
  symbols: LspDocumentSymbol[];
}

/** A completion request at a cursor position. */
@example(#{ text: "datasource db {\n  provider = \n}\n", line: 1, character: 13 })
model CompleteBody {
  /** The text as typed */
  text: schemaText;

  /** The file the text belongs to, so the other loaded schema files are seen; the first file when omitted */
  path?: string;

  /** The cursor line */
  line: line;

  /** The cursor column */
  character: character;

  /** The character that opened the list (`@`, `"`, `.`), when one did rather than typing */
  triggerCharacter?: string;
}

/** How the `insertText` of a completion is to be read. */
union InsertTextFormat {
  /** Insert the text as it is */
  plainText: "plainText",

  /** An LSP snippet: `$1`, `${2:name}` are tab stops the editor expands */
  snippet: "snippet",
}

/** One completion the Prisma language server offers. */
@example(#{
  label: "postgresql",
  kind: 12,
  detail: null,
  documentation: "The PostgreSQL provider",
  insertText: "\"postgresql\"",
  insertTextFormat: "plainText",
  sortText: null,
})
model Completion {
  /** What the completion list shows */
  label: string;

  /** The LSP `CompletionItemKind` (13 = enum value, 14 = keyword, 10 = property, ...), when the server gives one */
  kind: int32 | null;

  /** A short type or kind, when the server gives one */
  detail: string | null;

  /** The documentation text (Markdown), when the server gives one */
  documentation: string | null;

  /** The text to insert; a snippet keeps its tab stops */
  insertText: string;

  /** Whether `insertText` is plain text or a snippet */
  insertTextFormat: InsertTextFormat;

  /** The key the list is sorted by, when the server gives one */
  sortText: string | null;
}

/** The completions at a position. */
@example(#{ items: #[] })
@extension("x-brand", "Completions")
model Completions {
  /** The offered completions in the server's order */
  items: Completion[];
}

/** A request about the symbol at a cursor position (hover, definition, references). */
@example(#{ text: "model User {\n  id Int @id\n}\n", line: 1, character: 3 })
model PositionBody {
  /** The text as typed */
  text: schemaText;

  /** The file the text belongs to, so the other loaded schema files are seen; the first file when omitted */
  path?: string;

  /** The cursor line */
  line: line;

  /** The cursor column */
  character: character;
}

/** Where the symbol at a position is declared. */
@example(#{ locations: #[] })
@extension("x-brand", "Definition")
model Definition {
  /** The declarations, empty when the position holds no reference to one */
  locations: LspLocation[];
}

/** Every place the symbol at a position is used, across the loaded files. */
@example(#{ locations: #[] })
@extension("x-brand", "References")
model References {
  /** The uses, including the declaration; empty when the position holds no symbol */
  locations: LspReference[];
}

/** A rename request: the symbol at a position and its new name. */
@example(#{ text: "model User {\n  id Int @id\n}\n", line: 0, character: 7, newName: "Account" })
model RenameBody {
  /** The text as typed */
  text: schemaText;

  /** The file the text belongs to, so the other loaded schema files are seen; the first file when omitted */
  path?: string;

  /** The cursor line */
  line: line;

  /** The cursor column */
  character: character;

  /** The new name */
  newName: string;
}

/** The edits a rename makes, per file. */
@example(#{ changes: #[] })
@extension("x-brand", "Rename")
model Rename {
  /** The edits, grouped by file; empty when the position holds nothing to rename */
  changes: LspFileEdit[];
}

/** A code action request: a range and the diagnostics the editor shows in it. */
@example(#{
  text: "model User {\n  role R\n}\n",
  range: #{ start: #{ line: 1, character: 7 }, end: #{ line: 1, character: 8 } },
  diagnostics: #[],
})
model CodeActionBody {
  /** The text as typed */
  text: schemaText;

  /** The file the text belongs to, so the other loaded schema files are seen; the first file when omitted */
  path?: string;

  /** The range the actions are asked for */
  range: LspRange;

  /** The diagnostics in that range, as the lint route returned them */
  diagnostics: LspDiagnostic[];
}

/** One quick fix the language server offers. */
@example(#{ title: "Change spelling to 'Role'", changes: #[], isPreferred: true })
model CodeAction {
  /** What the fix does */
  title: string;

  /** The edits, grouped by file */
  changes: LspFileEdit[];

  /** Whether it is the fix to apply first */
  isPreferred: boolean;
}

/** The quick fixes at a range. */
@example(#{ actions: #[] })
@extension("x-brand", "CodeActions")
model CodeActions {
  /** The offered fixes */
  actions: CodeAction[];
}

/** What the Prisma language server says about the symbol under the cursor. */
@example(#{
  contents: "```prisma\nmodel User {\n\t...\n}\n```",
  range: #{ start: #{ line: 4, character: 9 }, end: #{ line: 4, character: 13 } },
})
@extension("x-brand", "Hover")
model Hover {
  /** Markdown to show, or null when there is nothing to say about the position */
  contents: string | null;

  /** The word the hover is about, when the server names it */
  range: LspRange | null;
}
// ---------------------------------------------------------------------------
// Documentation (the reference page Studio renders at /docs)
// ---------------------------------------------------------------------------

/** Where a referenced type of the Prisma client API is declared, which decides what the page links to. */
union DocsTypeLocation {
  /** A scalar such as `String`, `Int`, `Decimal` or `Bytes`: shown as text */
  `scalar`: "scalar",

  /** An input type (`UserWhereInput`): linked to its section */
  inputObjectTypes: "inputObjectTypes",

  /** An output type (`User`, `AggregateUser`): linked to its section */
  outputObjectTypes: "outputObjectTypes",

  /** An enum (`Role`, `SortOrder`, `UserScalarFieldEnum`): linked to its section */
  enumTypes: "enumTypes",

  /** A field reference (`StringFieldRefInput`): shown as text */
  fieldRefTypes: "fieldRefTypes",
}

/** A reference to a type in the Prisma client API. */
@example(#{ type: "UserWhereInput", isList: false, location: "inputObjectTypes" })
model DocsTypeRef {
  /** The type name: a scalar, an enum, an input type or an output type */
  type: string;

  /** Whether the reference is a list of that type */
  isList: boolean;

  /** Where the type is declared */
  location: DocsTypeLocation;
}

/** A model-level attribute (`@@id`, `@@unique`, `@@index`) and the fields it covers. */
@example(#{ name: "@@unique", values: #["email"] })
model DocsDirective {
  /** The attribute name */
  name: string;

  /** The field names the attribute lists */
  values: string[];
}

/** One field of a model, as the documentation shows it. */
@example(#{
  name: "email",
  type: "String",
  bareTypeName: "String",
  kind: "scalar",
  directives: #["@unique"],
  documentation: "Sign-in address",
  required: true,
})
model DocsField {
  /** The field name */
  name: string;

  /** The type as written, with `?` for optional and `[]` for lists */
  type: string;

  /** The type name without modifiers, used to link to the output type or enum */
  bareTypeName: string;

  /** What the field holds: a relation links to the model's output type, an enum to its enum section */
  kind: FieldKind;

  /** The field attributes (`@id`, `@unique`, `@default(...)`, `@updatedAt`) */
  directives: string[];

  /** The `///` doc comment */
  documentation: string | null;

  /** Whether the field is required */
  required: boolean;
}

/** One argument of a Prisma client operation. */
@example(#{
  name: "where",
  types: #[#{ type: "UserWhereUniqueInput", isList: false, location: "inputObjectTypes" }],
  required: true,
})
model DocsOperationInput {
  /** The argument name */
  name: string;

  /** The accepted types */
  types: DocsTypeRef[];

  /** Whether the argument is required */
  required: boolean;
}

/** What a Prisma client operation returns. */
@example(#{ type: "User", required: true, list: false })
model DocsOperationOutput {
  /** The output type name, when the client API declares the operation */
  type: string | null;

  /** Whether the result is non-null */
  required: boolean;

  /** Whether the result is a list */
  list: boolean;
}

/** One Prisma client operation of a model (`findMany`, `create`, ...). */
@example(#{
  name: "findUnique",
  description: "Find zero or one User",
  usage: "// Get one User\nconst user = await prisma.user.findUnique({\n  where: {\n    // ... provide filter here\n  }\n})",
  inputs: #[
    #{
      name: "where",
      types: #[#{ type: "UserWhereUniqueInput", isList: false, location: "inputObjectTypes" }],
      required: true,
    }
  ],
  output: #{ type: "User", required: false, list: false },
})
model DocsOperation {
  /** The operation name */
  name: string;

  /** What the operation does */
  description: string;

  /** A usage snippet with the Prisma client */
  usage: string;

  /** The arguments, when the client API declares the operation */
  inputs: DocsOperationInput[] | null;

  /** The result */
  output: DocsOperationOutput;
}

/** One model of the documentation. */
@example(#{
  name: "User",
  documentation: "A registered account",
  directives: #[#{ name: "@@unique", values: #["email"] }],
  fields: #[],
  operations: #[],
})
model DocsModel {
  /** The model name */
  name: string;

  /** The `///` doc comment */
  documentation: string | null;

  /** The model-level attributes */
  directives: DocsDirective[];

  /** The fields in declaration order */
  fields: DocsField[];

  /** The Prisma client operations of the model */
  operations: DocsOperation[];
}

/** One field of an input or output type of the Prisma client API. */
@example(#{
  name: "email",
  types: #[#{ type: "String", isList: false, location: "scalar" }],
  nullable: false,
})
model DocsTypeField {
  /** The field name */
  name: string;

  /** The accepted types */
  types: DocsTypeRef[];

  /** Whether the field may be null (input types), or is non-null (output types), as the original page shows it */
  nullable: boolean;
}

/** One input or output type of the Prisma client API. */
@example(#{ name: "UserWhereInput", fields: #[] })
model DocsType {
  /** The type name */
  name: string;

  /** The fields in declaration order */
  fields: DocsTypeField[];
}

/** One enum of the Prisma client API: a schema enum, or one Prisma derives (`SortOrder`, `UserScalarFieldEnum`). */
@example(#{ name: "Role", values: #["ADMIN", "VIEWER"] })
model DocsEnum {
  /** The enum name */
  name: string;

  /** The values in declaration order */
  values: string[];
}

/** Everything the documentation page shows: the models with their operations, then the client API types. */
@example(#{ models: #[], inputTypes: #[], outputTypes: #[], enumTypes: #[] })
@extension("x-brand", "Docs")
model Docs {
  /** Every model in declaration order */
  models: DocsModel[];

  /** The input types of the Prisma client API */
  inputTypes: DocsType[];

  /** The output types: the model types, then the aggregate / payload types */
  outputTypes: DocsType[];

  /** The enums: the schema enums, then the ones Prisma derives (`SortOrder`, `UserScalarFieldEnum`, ...) */
  enumTypes: DocsEnum[];
}

// ---------------------------------------------------------------------------
// Problem details (RFC 9457)
// ---------------------------------------------------------------------------

/** One field that failed validation. */
@example(#{ field: "take", message: "take must be 1000 or fewer" })
model FieldError {
  /** Dot-separated path of the field the error occurred on */
  field: string;

  /** The validation message */
  message: string;
}

/**
 * RFC 9457 Problem Details for a request that failed validation.
 * `errors` is an extension member (RFC 9457 §3.2). The `@hono/zod-openapi` default hook returns
 * this shape for every route, short-circuiting before the handler; a write that the database
 * rejects is reported the same way with the offending field.
 */
@example(#{
  type: "/problems/validation-failed",
  title: "Validation Failed",
  status: 422,
  detail: "The request failed validation. See `errors` for the offending fields.",
  instance: "/api/db/rows/User",
  errors: #[#{ field: "take", message: "take must be 1000 or fewer" }],
})
model ValidationProblem {
  /** Problem type identifier (relative URI reference) */
  type: "/problems/validation-failed";

  /** Short, human-readable summary of the problem type */
  title: "Validation Failed";

  /** HTTP status code, restated in the body per RFC 9457 */
  status: 422;

  /** Human-readable explanation specific to this occurrence */
  detail: string;

  /** URI reference identifying this occurrence (the request path) */
  instance: string;

  /** Extension member: one entry per field that failed validation */
  errors: FieldError[];
}

/** 422 Unprocessable Content (`application/problem+json`) */
@error
model ValidationProblemResponse {
  @statusCode statusCode: 422;
  @header contentType: "application/problem+json";
  @body body: ValidationProblem;
}

/** RFC 9457 Problem Details for a model or schema file that does not exist in the loaded schema. */
@example(#{
  type: "/problems/not-found",
  title: "Not Found",
  status: 404,
  detail: "Unknown model \"Nope\".",
  instance: "/api/db/rows/Nope",
})
model NotFoundProblem {
  /** Problem type identifier (relative URI reference) */
  type: "/problems/not-found";

  /** Short, human-readable summary of the problem type */
  title: "Not Found";

  /** HTTP status code, restated in the body per RFC 9457 */
  status: 404;

  /** Human-readable explanation specific to this occurrence */
  detail: string;

  /** URI reference identifying this occurrence (the request path) */
  instance: string;
}

/** 404 Not Found (`application/problem+json`) */
@error
model NotFoundProblemResponse {
  @statusCode statusCode: 404;
  @header contentType: "application/problem+json";
  @body body: NotFoundProblem;
}

/**
 * RFC 9457 Problem Details for a request that needs the database while none is connected,
 * or whose statement the database rejected.
 */
@example(#{
  type: "/problems/service-unavailable",
  title: "Service Unavailable",
  status: 503,
  detail: "No database is connected. Set DATABASE_URL or pass --url to hekireki studio.",
  instance: "/api/db/counts",
})
model ServiceUnavailableProblem {
  /** Problem type identifier (relative URI reference) */
  type: "/problems/service-unavailable";

  /** Short, human-readable summary of the problem type */
  title: "Service Unavailable";

  /** HTTP status code, restated in the body per RFC 9457 */
  status: 503;

  /** Human-readable explanation specific to this occurrence */
  detail: string;

  /** URI reference identifying this occurrence (the request path) */
  instance: string;
}

/** 503 Service Unavailable (`application/problem+json`) */
@error
model ServiceUnavailableProblemResponse {
  @statusCode statusCode: 503;
  @header contentType: "application/problem+json";
  @body body: ServiceUnavailableProblem;
}

/**
 * RFC 9457 Problem Details for a contract violation (the server could not produce a response
 * matching this document) or any other unexpected failure.
 */
@example(#{
  type: "/problems/internal-server-error",
  title: "Internal Server Error",
  status: 500,
  detail: "An unexpected error occurred.",
  instance: "/api/schema",
})
model InternalServerProblem {
  /** Problem type identifier (relative URI reference) */
  type: "/problems/internal-server-error";

  /** Short, human-readable summary of the problem type */
  title: "Internal Server Error";

  /** HTTP status code, restated in the body per RFC 9457 */
  status: 500;

  /** Human-readable explanation specific to this occurrence */
  detail: string;

  /** URI reference identifying this occurrence (the request path) */
  instance: string;
}

/** 500 Internal Server Error (`application/problem+json`) */
@error
model InternalServerProblemResponse {
  @statusCode statusCode: 500;
  @header contentType: "application/problem+json";
  @body body: InternalServerProblem;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Migrate (the Prisma schema engine, in process: the migration history, the drift and the steps)
// ---------------------------------------------------------------------------

/** How the migration history of the directory and the database differ, when they do. */
union Divergence {
  /** The directory holds migrations the database has not applied */
  databaseIsBehind: "databaseIsBehind",

  /** The database has applied migrations the directory no longer holds */
  migrationsDirectoryIsBehind: "migrationsDirectoryIsBehind",

  /** Each has migrations the other does not */
  historiesDiverge: "historiesDiverge",
}

/** What a step of a plan does, which says how much care it needs. */
union StepKind {
  /** Rows changed before the schema does: the fixes the decisions of the page make */
  fix: "fix",

  /** The migration itself: the statements that take the database to the schema */
  migration: "migration",
}

/** One migration the database has recorded in `_prisma_migrations`. */
@example(#{
  name: "20260101000000_init",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:01.000Z",
  rolledBackAt: null,
  appliedStepsCount: 1,
  checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
})
model MigrationRecord {
  /** The directory name of the migration */
  name: string;

  /** When it started, as the database recorded it */
  startedAt: string | null;

  /** When it finished; null while it is running or if it failed */
  finishedAt: string | null;

  /** When it was marked rolled back, if it was */
  rolledBackAt: string | null;

  /** How many statements of it ran */
  appliedStepsCount: int32;

  /** The checksum of the migration file as it was when it ran */
  checksum: string;
}

/** The state of the migration history, and whether the database has drifted from the schema. */
@example(#{
  migrationsDir: "/app/prisma/migrations",
  hasMigrationsTable: true,
  applied: #[],
  pending: #["20260201000000_profile"],
  failed: #[],
  edited: #[],
  divergence: null,
  drift: true,
  baselineNeeded: false,
  missingFiles: #[],
})
@extension("x-brand", "MigrateStatus")
model MigrateStatus {
  /** Where the migrations of the project are read from */
  migrationsDir: string;

  /** Whether the database has `_prisma_migrations`; a database never migrated has not */
  hasMigrationsTable: boolean;

  /** Every migration the database has recorded, oldest first */
  applied: MigrationRecord[];

  /** Migrations in the directory the database has not applied */
  pending: string[];

  /** Migrations that failed and were never resolved */
  failed: string[];

  /** Migrations whose file changed after the database ran it */
  edited: string[];

  /** How the two histories differ, when they do */
  divergence: Divergence | null;

  /** Whether the database differs from the schema, migrations aside */
  drift: boolean;

  /**
   * Whether the database has tables and no migration history, which `prisma migrate deploy`
   * refuses (P3005): it has to be baselined at the migration it already matches
   */
  baselineNeeded: boolean;

  /** Migrations the database has recorded whose directory the migrations directory does not hold */
  missingFiles: string[];
}

/** One migration of the directory, and the SQL it holds. */
@example(#{
  name: "20260201000000_profile",
  file: "/app/prisma/migrations/20260201000000_profile/migration.sql",
  sql: "-- AlterTable\nALTER TABLE \"User\" ADD COLUMN \"name\" TEXT;\n",
})
@extension("x-brand", "MigrationFile")
model MigrationFile {
  /** The directory name of the migration */
  name: string;

  /** Where its migration.sql is */
  file: string;

  /** What the migration.sql holds */
  sql: string;
}

/** The steps of a plan, to rehearse. */
@example(#{ steps: #[#["ALTER TABLE \"User\" ADD COLUMN \"name\" TEXT"]] })
model RehearseBody {
  /** Each step's statements, in the order they run */
  steps: string[][];
}

/** How one step went in the rehearsal. */
@example(#{ ran: true, ok: true, affected: 2, error: null, statement: null })
model RehearsalStep {
  /** Whether it was run; a step after one that failed is not */
  ran: boolean;

  /** Whether every statement of it went through */
  ok: boolean;

  /** The rows its statements changed; null when it was not run */
  affected: int32 | null;

  /** What the database said to the statement it refused */
  error: string | null;

  /** The statement it refused */
  statement: string | null;
}

/** A table's rows, counted before and after. */
@example(#{ table: "User", before: 5, after: 4 })
model TableRows {
  /** The table, as the database names it */
  table: string;

  /** Its rows before; null when it was not there, or could not be counted */
  before: int32 | null;

  /** Its rows after; null when it is gone, or could not be counted */
  after: int32 | null;
}

/**
 * The migration run for real and taken back: on SQLite on a copy of the file, on PostgreSQL in a
 * transaction rolled back whatever happens. Nothing of it remains in the database.
 */
@example(#{
  ok: true,
  steps: #[],
  tables: #[],
  schemaMatches: true,
  difference: "",
  limitations: #[],
})
@extension("x-brand", "Rehearsal")
model Rehearsal {
  /** Whether every step went through */
  ok: boolean;

  /** How each step went, in order */
  steps: RehearsalStep[];

  /** Every table's rows before the steps and after them */
  tables: TableRows[];

  /** Whether the database the steps left matches the schema */
  schemaMatches: boolean;

  /** What still differs from the schema, as the SQL that would close it; empty when it matches */
  difference: string;

  /**
   * What the rehearsal could not show: `outside-transaction` when a step (an index made
   * CONCURRENTLY, an enum value added) cannot run in the transaction PostgreSQL rehearses in.
   * What it cost: `locks-tables` when it ran in a transaction on the database itself, which
   * holds the locks of its steps until the rollback (it waits five seconds for one, no longer)
   */
  limitations: string[];
}

/** The rows of every table of the database now. */
@example(#{ tables: #[] })
@extension("x-brand", "TableCounts")
model TableCounts {
  /** Each table and its rows; `before` is null and `after` is the count */
  tables: TableRows[];
}

/** A copy of the database taken before a migration that loses data. */
@example(#{
  name: "backup_20260917101500123",
  location: "/app/prisma/.hekireki/backups/backup_20260917101500123.db",
  size: 356352,
  restorable: true,
})
model Backup {
  /** What it is called: when it was taken */
  name: string;

  /** The file on SQLite, the schema on PostgreSQL */
  location: string;

  /** The file's size in bytes; null for a schema */
  size: int32 | null;

  /**
   * Whether Studio can restore it: a SQLite file, or a PostgreSQL schema that keeps the statements
   * of its restore; one taken before Studio kept them is its rows only, in the schema named
   */
  restorable: boolean;
}

/** The backups there are, newest first. */
@example(#{ backups: #[] })
@extension("x-brand", "Backups")
model Backups {
  /** Newest first */
  backups: Backup[];
}

/** A backup to restore, and the migration the restore undoes. */
@example(#{ name: "backup_20260917101500123", migration: "20260917101530_profile" })
model RestoreBody {
  /** The backup's name */
  name: string;

  /** The migration written by the run the backup was taken for, to remove from the directory */
  migration?: string;
}

/** One migration the database could be baselined at, and whether it matches. */
@example(#{ name: "20260101000000_init", matches: true, difference: "" })
model BaselineCandidate {
  /** The directory name of the migration */
  name: string;

  /** Whether the database is what this migration and those before it make of an empty one */
  matches: boolean;

  /** The SQL that would take what the migrations make to the database; empty when it matches */
  difference: string;
}

/** Where the database could be baselined: each migration, replayed into a shadow database. */
@example(#{ candidates: #[] })
@extension("x-brand", "MigrateBaseline")
model MigrateBaseline {
  /** Every migration of the directory, oldest first */
  candidates: BaselineCandidate[];
}

/** The statements that would take the database to the schema. */
@example(#{ sql: "-- AlterTable\nALTER TABLE \"User\" ADD COLUMN \"name\" TEXT;\n", drift: true })
@extension("x-brand", "MigrateDiff")
model MigrateDiff {
  /** The migration Prisma Migrate would write, empty when the database matches the schema */
  sql: string;

  /** Whether there was anything to write */
  drift: boolean;
}

/** One step of a plan: statements that are run, and reported, together. */
@example(#{
  title: "Add the column",
  kind: "migration",
  statements: #["ALTER TABLE \"User\" ADD COLUMN \"name\" TEXT"],
  changes: #[#{ kind: "add-column", table: "User", columns: #["name"], target: null }],
  destructive: false,
  rows: null,
  subject: null,
  fixKind: null,
})
model MigrationStep {
  /** What the step does, for the person deciding whether to run it */
  title: string;

  /** Whether it changes rows or the schema */
  kind: StepKind;

  /** The statements of the step, in the order they must run */
  statements: string[];

  /** What it does, one change each, in the words of the schema rather than of the database */
  changes: MigrationChange[];

  /** Whether it loses rows or what a column holds; a table rebuilt in place loses neither */
  destructive: boolean;

  /** How many rows a fix will change, counted against the database now; null for a schema step */
  rows: int32 | null;

  /** The field or relation a fix changes the rows of (`User.email`); null for a schema step */
  subject: string | null;

  /**
   * What a fix does to them: `nulls`, `values`, `duplicates`, `orphans`, `invalid`, `convert` or
   * `fill`; null for a schema step
   */
  fixKind: string | null;
}

/** One change a step makes, for the page to say in its own language. */
@example(#{ kind: "foreign-key", table: "Post", columns: #["categoryId"], target: "Category" })
model MigrationChange {
  /**
   * `create-enum`, `create-table`, `rebuild-table`, `copy-rows`, `drop-table`, `add-column`,
   * `drop-column`, `foreign-key`, `unique` or `index`
   */
  kind: string;

  /** The table it is about */
  table: string;

  /** The columns it is about, when it is about some */
  columns: string[];

  /** The table a foreign key points at; null otherwise */
  target: string | null;
}

/** How a check came out: nothing found, something that blocks, or a query that failed. */
union CheckStatus {
  /** No row of the database fails it */
  passed: "passed",

  /** Rows fail it and the migration cannot run until they are dealt with */
  blocking: "blocking",

  /** Rows are lost, which may be what was meant */
  warning: "warning",

  /** The check's own query failed */
  failed: "failed",

  /** The constraints of the database make it pass; nothing was counted */
  guaranteed: "guaranteed",
}

/** One thing the migration needs of the rows the database holds now. */
@example(#{
  kind: "unique",
  modelName: "User",
  subject: "User.email",
  what: "unique",
  hint: "Delete the duplicates before the key is made, or say which stays on the Migrate page.",
  field: "email",
  choices: #["keep-first-delete"],
  facts: #{ `model`: "User", field: "email", what: "unique", fields: "email" },
  lost: null,
  suggestion: #{ choice: "keep-first-delete", value: null, reason: "first-by-key" },
  candidates: #[],
  destinations: #[],
  status: "blocking",
  count: 2,
  error: null,
})
model MigrationCheck {
  /** Which check it is (`not-null`, `unique`, `enum`, `foreign-key`, ...) */
  kind: string;

  /** The model it is about */
  modelName: string;

  /** The model and field it is about */
  subject: string;

  /** What the migration asks of them */
  what: string;

  /** What to do about it, in a sentence */
  hint: string;

  /** The field, or the relation for a foreign key, a decision about it is made on */
  field: string;

  /** What can be decided about it on the page, empty when nothing can */
  choices: string[];

  /**
   * What to read it by, for the page to say in its own language: `model`, `field`, `what`, and by
   * kind `type`, `enum`, `removed`, `members`, `member`, `fields`, `orderBy`, `target`, `column`,
   * `renamedTo`, `from`, `to`, `default` or `table`
   */
  facts: Record<string>;

  /**
   * A query for the rows and values the change loses, as the database holds them now (a column or
   * table dropped, a column added again); null when it loses none
   */
  lost: string | null;

  /** The decision read from the schema and the database as the likeliest fit; null when there is none */
  suggestion: MigrationSuggestion | null;

  /**
   * Where the values of a dropped column could have gone, the likeliest first: a column of the same
   * table (`rename`) or of a related model (`move`) the migration adds, by the likeness of its name
   * and kind, each with why (`same-name`, `similar-name`, `same-name-related` or
   * `similar-name-related`). Empty when nowhere reads as one, and the values are lost.
   */
  candidates: MigrationSuggestion[];

  /**
   * Every column the migration adds that the values of a dropped column could go to, whatever its
   * name: for the page to complete the field a rename or a move names, and to show how it moves
   */
  destinations: MigrationDestination[];

  /** How it came out */
  status: CheckStatus;

  /** How many rows fail it; null when the check's query failed */
  count: int32 | null;

  /** Why the check could not be counted, when it could not */
  error: string | null;
}

/** A column the migration adds that the values of a dropped column could go to. */
@example(#{
  choice: "move",
  value: "Profile.nickname",
  type: "String",
  fits: true,
  relation: "points-here",
  via: "Profile.userId → User.id",
  created: true,
})
model MigrationDestination {
  /** `rename` for a column of the same table, `move` for one of a related model */
  choice: string;

  /** What the decision names: the field, or `Model.field` for a move */
  value: string;

  /** The Prisma type of the column */
  type: string;

  /** Whether the values fit its kind (text takes any) */
  fits: boolean;

  /**
   * How the tables are related: `same` table, the destination's rows `points-here` (a profile at
   * its user), or this table's rows point at the destination's (`pointed-at`)
   */
  relation: string;

  /** The foreign key the values move along, `Profile.userId → User.id`; null for a rename */
  via: string | null;

  /** Whether the migration creates the destination's table, whose rows are made from the values */
  created: boolean;
}

/** A decision offered ready-made: nothing is decided until it is taken. */
@example(#{ choice: "keep-first-delete", value: "createdAt", reason: "oldest" })
model MigrationSuggestion {
  /** One of the choices of the check */
  choice: string;

  /** What the choice needs, as a decision carries it */
  value: string | null;

  /**
   * Why it is offered: `schema-default`, `uuid`, `random-id`, `now`, `from-key`, `empty-string`,
   * `zero`, `false`, `empty-object`, `first-referenced`, `enum-first`, `enum-default`,
   * `enum-same-name`, `enum-replaced`, `oldest`, `first-by-key`, `optional-relation`,
   * `required-relation`, `renamed`, `moved`, `convert-number`, `clamp`,
   * `truncate`, `nullable` or `not-nullable`
   */
  reason: string;
}

/** The rows of one model as the fixes will leave them, from a query that writes nothing. */
@example(#{ modelName: "User", sql: "WITH hk_fix_0 AS (...) SELECT * FROM hk_fix_0 ORDER BY id" })
model MigrationPreview {
  /** The model the rows belong to */
  modelName: string;

  /** The query that shows them; it reads, and changes nothing */
  sql: string;
}

/** A kept decision that no longer fits, and why. */
@example(#{
  kind: "column-added",
  modelName: "User",
  field: "hekireki",
  choice: "value",
  value: "",
  reasons: #["User.hekireki: User has no field hekireki."],
})
model UnfitDecision {
  /** The check it answered */
  kind: string;

  /** The model it is about */
  modelName: string;

  /** The field, or the relation for a foreign key */
  field: string;

  /** What it said to do */
  choice: string;

  /** What the choice was given; null when it needed nothing */
  value: string | null;

  /** What no longer fits, as the check says it */
  reasons: string[];
}

/** A migration laid out as steps that can be run one at a time. */
@example(#{
  name: "20260201000000_profile",
  steps: #[],
  checks: #[],
  unfit: #[],
  previews: #[],
  notes: #[],
  errors: #[],
})
@extension("x-brand", "MigratePlan")
model MigratePlan {
  /** The directory name the migration would be written under */
  name: string;

  /** The steps, in the order they must run */
  steps: MigrationStep[];

  /** What the migration needs of the rows the database holds now */
  checks: MigrationCheck[];

  /**
   * Kept decisions set aside because they no longer fit the schema or the database: a field or
   * model the schema has lost since they were made. The plan is made without them.
   */
  unfit: UnfitDecision[];

  /** Each fixed model's rows as the fixes will leave them, before anything is run */
  previews: MigrationPreview[];

  /** What the person running it needs to know */
  notes: string[];

  /** Why the plan cannot be run as it is, when it cannot */
  errors: string[];
}

/**
 * A decision made on the page: which check it answers, what it is about, and what to do. Studio
 * keeps them in `.hekireki/migrate.json` beside the schema, and `hekireki migrate check` and
 * `hekireki migrate plan` read the same file, so the command line makes the same plan.
 */
@example(#{ kind: "not-null", modelName: "User", field: "name", choice: "value", value: "unknown" })
model MigrationDecision {
  /** The check it answers (`not-null`, `unique`, `foreign-key`, ...) */
  kind: string;

  /** The model it is about */
  modelName: string;

  /** The field, or the relation for a foreign key */
  field: string;

  /** What to do, from the choices the check offers */
  choice: string;

  /**
   * What a choice needs, when it needs something: the value or SQL written, the field a rename
   * became, the `STORED=MEMBER` pairs of an enum, or the field duplicates are ordered by
   */
  value?: string;
}

/** What has been decided on the page, and where Studio keeps it. */
@example(#{ file: "/app/prisma/.hekireki/migrate.json", decisions: #[] })
@extension("x-brand", "MigrationDecisions")
model MigrationDecisions {
  /** The file the decisions are kept in, beside the schema */
  file: string;

  /** The decisions, in the order they were made */
  decisions: MigrationDecision[];
}

/** Decisions to keep, replacing the ones kept now. */
@example(#{ decisions: #[] })
model DecisionsBody {
  /** All of them: what is left out is forgotten */
  decisions: MigrationDecision[];
}

/** The name to propose for a migration, and the decisions made for it on the page. */
@example(#{ name: "profile", decisions: #[] })
model PlanBody {
  /** What to call it; the timestamp is put in front */
  name?: string;

  /** Every decision to plan with, in place of the ones kept; the kept ones when left out */
  decisions?: MigrationDecision[];

  /**
   * The most rows one statement of a fix changes: a fix over more is run that many at a time, so
   * none holds its locks on the whole table; all of them at once when left out
   */
  @minValue(1)
  batch?: int32;
}

/** Statements to run, one at a time. */
@example(#{ statements: #["ALTER TABLE \"User\" ADD COLUMN \"name\" TEXT"] })
model ApplyBody {
  /** The statements, in the order they must run */
  statements: string[];
}

/** What one statement did, or why the database refused it. */
@example(#{ sql: "ALTER TABLE \"User\" ADD COLUMN \"name\" TEXT", affected: 0, error: null })
model StatementResult {
  /** The statement as it was sent */
  sql: string;

  /** How many rows it changed; null when it failed */
  affected: int32 | null;

  /** What the database said, when it refused */
  error: string | null;
}

/** How far a staged apply got. */
@example(#{ results: #[], failedAt: null, ok: true })
@extension("x-brand", "ApplyResult")
model ApplyResult {
  /** One result per statement attempted; the ones after a failure are not attempted */
  results: StatementResult[];

  /** The index of the statement that failed, null when none did */
  failedAt: int32 | null;

  /** Whether every statement ran */
  ok: boolean;
}

/** A migration to write to the migrations directory. */
@example(#{ name: "profile", sql: "ALTER TABLE \"User\" ADD COLUMN \"name\" TEXT;\n" })
model CreateMigrationBody {
  /** What to call it; the timestamp is put in front */
  name: string;

  /** The statements to write to migration.sql */
  sql: string;
}

/** Where a migration was written. */
@example(#{ name: "20260201000000_profile", file: "/app/prisma/migrations/20260201000000_profile/migration.sql" })
@extension("x-brand", "CreatedMigration")
model CreatedMigration {
  /** The directory name it was written under */
  name: string;

  /** The migration.sql that was written */
  file: string;
}

/** A migration whose statements have already been run. */
@example(#{ name: "20260201000000_profile" })
model MarkAppliedBody {
  /** The directory name of the migration to record */
  name: string;
}

/** The migrations a deploy ran. */
@example(#{ applied: #["20260201000000_profile"] })
@extension("x-brand", "Deployed")
model Deployed {
  /** The migrations that were applied, oldest first */
  applied: string[];
}

@route("/schema")
@tag("schema")
namespace SchemaRoutes {
  /** The current snapshot: the last valid schema, the current Prisma error and the files on disk. */
  @get
  @operationId("readSchema")
  op read(): Snapshot | InternalServerProblemResponse;

  /** Re-read and re-parse the schema from disk (the watcher does this on its own after every save). */
  @post
  @route("/reload")
  @operationId("reloadSchema")
  op reload(): Snapshot | InternalServerProblemResponse;

  /**
   * Write one schema file back to disk and reload, so the returned snapshot reflects the edit.
   * Only a path listed in `Snapshot.files` can be written (404 otherwise); a file the OS refuses
   * to write is reported as a validation problem on `path`.
   */
  @put
  @route("/files")
  @operationId("writeSchemaFile")
  op writeFile(@body body: FileWrite):
    | Snapshot
    | NotFoundProblemResponse
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /**
   * Server-sent events: `ready` (data: the current `updatedAt`) on connect, `change` (data: the
   * new `updatedAt`) after every reload, `migrations` (data: when it was seen) after the
   * migrations directory changes, and `ping` every 15 seconds to keep the connection open.
   */
  @get
  @route("/events")
  @operationId("readSchemaEvents")
  op events(): {
    @statusCode statusCode: 200;
    @header contentType: "text/event-stream";
    @body body: string;
  };
}

@route("/db")
@tag("db")
namespace DbRoutes {
  /** The database connection status. */
  @get
  @operationId("readDbStatus")
  op status(): DbStatus | InternalServerProblemResponse;

  /** Row count of every model that has a table; a model whose count fails is left out. */
  @get
  @route("/counts")
  @operationId("readCounts")
  op counts(): Counts | ServiceUnavailableProblemResponse | InternalServerProblemResponse;

  /** One page of a model's rows, keyed by field name, ordered by the key fields. */
  @get
  @route("/rows/{modelName}")
  @operationId("readRows")
  op rows(@path modelName: modelName, ...RowsQuery):
    | Rows
    | NotFoundProblemResponse
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Insert one row; field names are translated to columns and values to the driver's representation. */
  @post
  @route("/rows/{modelName}")
  @operationId("createRow")
  op insert(@path modelName: modelName, @body body: InsertBody):
    | Affected
    | NotFoundProblemResponse
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Update the row identified by `where`; both parts must name at least one field. */
  @patch
  @route("/rows/{modelName}")
  @operationId("updateRow")
  op update(@path modelName: modelName, @body body: UpdateBody):
    | Affected
    | NotFoundProblemResponse
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Delete the row identified by `where`. */
  @delete
  @route("/rows/{modelName}")
  @operationId("deleteRow")
  op remove(@path modelName: modelName, @body body: DeleteBody):
    | Affected
    | NotFoundProblemResponse
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Run the statements one by one and return the rows of the last, or its affected count for a write, with the wall time of the whole. */
  @post
  @route("/sql")
  @operationId("runSql")
  op sql(@body body: SqlBody):
    | SqlResult
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** The execution plan the database chooses for the first statement of the text. */
  @post
  @route("/explain")
  @operationId("explainSql")
  op explain(@body body: SqlBody):
    | Plan
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Analyze the statements against the Prisma schema's tables: data flow, lineage, row type, parameters and problems. */
  @post
  @route("/analyze")
  @operationId("analyzeSql")
  op analyze(@body body: AnalyzeBody):
    | Analysis
    | ValidationProblemResponse
    | InternalServerProblemResponse;
}

@route("/client")
@tag("client")
namespace ClientRoutes {
  /** Load the project's Prisma Client, the first time it is asked for, and say whether it could. */
  @get
  @operationId("readClientStatus")
  op status(): ClientStatus | InternalServerProblemResponse;

  /** Read the query against the schema's models, without running it: its calls and its problems. */
  @post
  @route("/analyze")
  @operationId("analyzeClientQuery")
  op analyze(@body body: ClientQueryBody):
    | ClientAnalysis
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** The completions TypeScript offers at a position, against the client's types. */
  @post
  @route("/complete")
  @operationId("completeClientQuery")
  op complete(@body body: ClientPositionBody):
    | ClientCompletions
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** The type and documentation of one completion item. */
  @post
  @route("/complete/detail")
  @operationId("detailClientCompletion")
  op completeDetail(@body body: ClientCompletionDetailBody):
    | ClientCompletionDetail
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** What TypeScript says about the symbol at a position. */
  @post
  @route("/hover")
  @operationId("hoverClientQuery")
  op hover(@body body: ClientPositionBody):
    | ClientHover
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** The signatures of the call the cursor is inside. */
  @post
  @route("/signature")
  @operationId("signatureClientQuery")
  op signature(@body body: ClientPositionBody):
    | ClientSignatureHelp
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** The query laid out as the TypeScript formatter writes it; a query that does not parse is reported on `query`. */
  @post
  @route("/format")
  @operationId("formatClientQuery")
  op format(@body body: ClientQueryBody):
    | ClientFormatted
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** What TypeScript finds wrong with the query, checked against the client's types. */
  @post
  @route("/check")
  @operationId("checkClientQuery")
  op check(@body body: ClientQueryBody):
    | ClientTypeDiagnostics
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Run a query that only reads to show the SQL it sends while it is typed; a write is refused on `query`. */
  @post
  @route("/preview")
  @operationId("previewClientQuery")
  op preview(@body body: ClientQueryBody):
    | ClientPreview
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Run the query through the project's Prisma Client and return its result with the SQL it sent. */
  @post
  @route("/run")
  @operationId("runClientQuery")
  op run(@body body: ClientQueryBody):
    | ClientResult
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;
}

@route("/prisma")
@tag("prisma")
namespace PrismaRoutes {
  /** The edits that lay the text out as the Prisma formatter does. */
  @post
  @route("/format")
  @operationId("formatSchemaText")
  op format(@body body: TextBody):
    | Formatted
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** Validate the buffer together with the other loaded files and return its diagnostics. */
  @post
  @route("/lint")
  @operationId("lintSchemaText")
  op lint(@body body: LintBody):
    | Diagnostics
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** The blocks of the text, as the language server's document outline lists them. */
  @post
  @route("/symbols")
  @operationId("symbolsSchemaText")
  op symbols(@body body: TextBody):
    | Symbols
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** Completions the Prisma language server offers at a cursor position. */
  @post
  @route("/complete")
  @operationId("completeSchemaText")
  op complete(@body body: CompleteBody):
    | Completions
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** What the Prisma language server says about the symbol at a cursor position. */
  @post
  @route("/hover")
  @operationId("hoverSchemaText")
  op hover(@body body: PositionBody):
    | Hover
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** Where the model, enum or type referenced at a cursor position is declared. */
  @post
  @route("/definition")
  @operationId("defineSchemaText")
  op definition(@body body: PositionBody):
    | Definition
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** Every place the symbol at a cursor position is used, across the loaded files. */
  @post
  @route("/references")
  @operationId("referencesSchemaText")
  op references(@body body: PositionBody):
    | References
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** The edits that rename the model or enum at a cursor position everywhere it is used. */
  @post
  @route("/rename")
  @operationId("renameSchemaText")
  op rename(@body body: RenameBody):
    | Rename
    | ValidationProblemResponse
    | InternalServerProblemResponse;

  /** The quick fixes the Prisma language server offers for the diagnostics in a range. */
  @post
  @route("/code-actions")
  @operationId("codeActionsSchemaText")
  op codeActions(@body body: CodeActionBody):
    | CodeActions
    | ValidationProblemResponse
    | InternalServerProblemResponse;
}

@route("/migrate")
@tag("migrate")
namespace MigrateRoutes {
  /**
   * The migration history of the database against the migrations directory, and whether the
   * database has drifted from the schema. Reads only.
   */
  @get
  @operationId("readMigrateStatus")
  op status():
    | MigrateStatus
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * Which migrations the database already matches, for a database with tables and no history:
   * each migration and those before it replayed into a shadow database and compared with it.
   * Reads the database; writes nothing to it.
   */
  @get
  @route("/baseline")
  @operationId("readMigrateBaseline")
  op baseline():
    | MigrateBaseline
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * Baselines the database: records the migration named and every one before it as applied,
   * without running them. Refused when the database does not match them.
   */
  @post
  @route("/baseline")
  @operationId("baselineMigrations")
  op markBaseline(@body body: MarkAppliedBody):
    | MigrateStatus
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * The migration that would take the database to the schema, as Prisma Migrate would write it.
   * Reads the database; writes nothing to it.
   */
  @get
  @route("/diff")
  @operationId("readMigrateDiff")
  op diff():
    | MigrateDiff
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * The migration laid out as steps that can be run one at a time, the statements that change
   * rows before the ones that change the schema.
   */
  @post
  @route("/plan")
  @operationId("planMigration")
  op plan(@body body: PlanBody):
    | MigratePlan
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * Runs the statements one at a time and stops at the first the database refuses. What ran
   * stays run: none of the three databases undoes a DDL statement already done.
   */
  @post
  @route("/apply")
  @operationId("applyMigrationStatements")
  op apply(@body body: ApplyBody):
    | ApplyResult
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * The migration run for real and taken back, to see before it runs whether it goes through,
   * what it does to the rows of each table, and whether the database then matches the schema.
   */
  @post
  @route("/rehearse")
  @operationId("rehearseMigration")
  op rehearse(@body body: RehearseBody):
    | Rehearsal
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** The rows of every table of the database now, to compare a run with. */
  @get
  @route("/tables")
  @operationId("readTableCounts")
  op tables(): TableCounts | ServiceUnavailableProblemResponse | InternalServerProblemResponse;

  /** The backups taken before migrations, newest first. */
  @get
  @route("/backups")
  @operationId("readBackups")
  op backups(): Backups | ServiceUnavailableProblemResponse | InternalServerProblemResponse;

  /** Takes a backup of the database as it is now. */
  @post
  @route("/backups")
  @operationId("createBackup")
  op backup(): Backup | ValidationProblemResponse | ServiceUnavailableProblemResponse | InternalServerProblemResponse;

  /**
   * Puts the database back as a backup has it (SQLite), and removes from the directory the
   * migration the run it undoes wrote.
   */
  @post
  @route("/backups/restore")
  @operationId("restoreBackup")
  op restore(@body body: RestoreBody):
    | MigrateStatus
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** The migration.sql of one migration of the directory; 404 when the directory holds none of that name. */
  @get
  @route("/migrations/{migrationName}")
  @operationId("readMigrationFile")
  op file(@path migrationName: string):
    | MigrationFile
    | NotFoundProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Writes a migration.sql to the migrations directory, so Prisma Migrate owns it from now on. */
  @post
  @route("/migrations")
  @operationId("createMigration")
  op create(@body body: CreateMigrationBody):
    | CreatedMigration
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * Records a migration as applied without running it, for one whose statements were run a step
   * at a time. The database must have been migrated at least once.
   */
  @post
  @route("/migrations/applied")
  @operationId("markMigrationApplied")
  op markApplied(@body body: MarkAppliedBody):
    | MigrateStatus
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * Records a migration as rolled back, for one that failed and left the database as it was. It
   * stops counting as failed, which a database has to have before anything else reaches it.
   */
  @post
  @route("/migrations/rolled-back")
  @operationId("markMigrationRolledBack")
  op markRolledBack(@body body: MarkAppliedBody):
    | MigrateStatus
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** What has been decided on the page about the checks, as Studio kept it. */
  @get
  @route("/decisions")
  @operationId("readMigrationDecisions")
  op decisions():
    | MigrationDecisions
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /**
   * Keeps the decisions, so the same plan is made the next time the page is opened, and by
   * `hekireki migrate check` and `hekireki migrate plan` from the command line.
   */
  @put
  @route("/decisions")
  @operationId("writeMigrationDecisions")
  op writeDecisions(@body body: DecisionsBody):
    | MigrationDecisions
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;

  /** Applies every migration the database has not run yet, as `prisma migrate deploy` does. */
  @post
  @route("/deploy")
  @operationId("deployMigrations")
  op deploy():
    | Deployed
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;
}

@route("/docs")
@tag("docs")
namespace DocsRoutes {
  /** The documentation of the last schema that parsed: models, operations and client API types. */
  @get
  @operationId("readDocs")
  op read(): Docs | InternalServerProblemResponse;
}
