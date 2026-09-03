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

/** One SQL statement, run as written (the Studio API is loopback-only; there is no sandbox). */
@minLength(1)
@extension("x-trim", true)
@extension("x-error-message", "SQL must be a string")
@extension("x-minLength-message", "SQL must not be empty")
@extension("x-brand", "Sql")
scalar sql extends string;

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

  /** `DATABASE_URL` in the environment or `.env` */
  env: "env",

  /** `datasource.url` in `prisma.config.ts` */
  config: "config",
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

/** How serious a Prisma diagnostic is. */
union Severity {
  /** The schema does not parse until this is fixed */
  error: "error",

  /** The schema parses, but Prisma advises a change */
  warning: "warning",
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

/**
 * The latest parse result. `schema` is the last schema that parsed (null until one does) and
 * `error` the current Prisma error, so a broken edit never blanks the UI. `files` always reflects
 * the disk, even while the schema is broken.
 */
@example(#{
  schema: null,
  error: "error: Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  updatedAt: utcDateTime.fromISO("2026-09-02T00:00:00.000Z"),
  files: #[#{ path: "prisma/schema.prisma", content: "model User {\n  id Nope @id\n}\n" }],
})
@extension("x-brand", "Snapshot")
model Snapshot {
  /** The last schema that parsed, or null before the first successful parse */
  schema: Schema | null;

  /** The Prisma error of the latest parse, or null when it succeeded */
  error: string | null;

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
  /** The statement */
  sql: sql;
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

// ---------------------------------------------------------------------------
// Prisma language server
// ---------------------------------------------------------------------------

/** Schema text to format. */
@example(#{ text: "model User {\nid Int @id\n}\n" })
model TextBody {
  /** The text as typed */
  text: schemaText;
}

/** Formatted schema text. */
@example(#{ text: "model User {\n  id Int @id\n}\n" })
@extension("x-brand", "Formatted")
model Formatted {
  /** The text as the Prisma formatter lays it out */
  text: string;
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

/** One Prisma diagnostic, positioned by string offsets into the text. */
@example(#{
  from: 19,
  to: 23,
  message: "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  severity: "error",
})
model Diagnostic {
  /** Start offset (inclusive) */
  from: int32;

  /** End offset (exclusive) */
  to: int32;

  /** The Prisma message */
  message: string;

  /** How serious it is */
  severity: Severity;
}

/** The diagnostics of one file. */
@example(#{ diagnostics: #[] })
@extension("x-brand", "Diagnostics")
model Diagnostics {
  /** Every diagnostic Prisma reported for the file */
  diagnostics: Diagnostic[];
}

/** A completion request at a cursor position. */
@example(#{ text: "datasource db {\n  provider = \n}\n", line: 1, character: 13 })
model CompleteBody {
  /** The text as typed */
  text: schemaText;

  /** The cursor line */
  line: line;

  /** The cursor column */
  character: character;
}

/** One completion the Prisma language server offers. */
@example(#{
  label: "postgresql",
  detail: null,
  documentation: "The PostgreSQL provider",
  insertText: "\"postgresql\"",
})
model Completion {
  /** What the completion list shows */
  label: string;

  /** A short type or kind, when the server gives one */
  detail: string | null;

  /** The documentation text, when the server gives one */
  documentation: string | null;

  /** The text to insert, with LSP snippet placeholders stripped */
  insertText: string;
}

/** The completions at a position. */
@example(#{ items: #[] })
@extension("x-brand", "Completions")
model Completions {
  /** The offered completions in the server's order */
  items: Completion[];
}

// ---------------------------------------------------------------------------
// Documentation (the reference page `hekireki docs serve` renders)
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
   * new `updatedAt`) after every reload, and `ping` every 15 seconds to keep the connection open.
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

  /** Run one statement and return its rows, or the affected count for a write, with the wall time. */
  @post
  @route("/sql")
  @operationId("runSql")
  op sql(@body body: SqlBody):
    | SqlResult
    | ValidationProblemResponse
    | ServiceUnavailableProblemResponse
    | InternalServerProblemResponse;
}

@route("/prisma")
@tag("prisma")
namespace PrismaRoutes {
  /** Format schema text with the Prisma formatter. */
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

  /** Completions the Prisma language server offers at a cursor position. */
  @post
  @route("/complete")
  @operationId("completeSchemaText")
  op complete(@body body: CompleteBody):
    | Completions
    | ValidationProblemResponse
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
