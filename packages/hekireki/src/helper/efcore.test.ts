import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import {
  contextFile,
  deleteBehavior,
  entityFile,
  enumFile,
  isCSharpIdentifier,
  isCSharpTypeName,
  planEfCore,
} from './efcore.js'

const DEFAULT_OPTIONS = { namespace: 'Models', context: 'AppDbContext' }

function fixture(schema: string, options = DEFAULT_OPTIONS) {
  const result = getDMMF({ datamodel: [['schema.prisma', schema]] })
  if ('type' in result) throw new Error(result.error.message)
  return { datamodel: result.datamodel, plan: planEfCore(result.datamodel, options) }
}

function model(datamodel: DMMF.Datamodel, name: string) {
  const found = datamodel.models.find((m) => m.name === name)
  if (!found) throw new Error(`no model ${name}`)
  return found
}

function enumOf(datamodel: DMMF.Datamodel, name: string) {
  const found = datamodel.enums.find((e) => e.name === name)
  if (!found) throw new Error(`no enum ${name}`)
  return found
}

describe('isCSharpIdentifier', () => {
  it.each(['Models', 'My', '_private', 'App1', 'AppDbContext'])('accepts %s', (name) => {
    expect(isCSharpIdentifier(name)).toBe(true)
  })

  it.each(['', '1App', 'My-App', 'My.App', 'class', 'namespace', 'Café', 'a b'])(
    'rejects %j',
    (name) => {
      expect(isCSharpIdentifier(name)).toBe(false)
    },
  )
})

describe('isCSharpTypeName', () => {
  it.each(['AppDbContext', 'Db', 'db1', 'd_b'])('accepts %s', (name) => {
    expect(isCSharpTypeName(name)).toBe(true)
  })

  it.each(['db', 'record', 'file', 'required', 'scoped', 'class', 'App Context'])(
    'rejects %j',
    (name) => {
      expect(isCSharpTypeName(name)).toBe(false)
    },
  )
})

describe('deleteBehavior', () => {
  it.each([
    ['Cascade', true, 'Cascade'],
    ['Cascade', false, 'Cascade'],
    ['SetNull', false, 'SetNull'],
    ['Restrict', true, 'Restrict'],
    ['Restrict', false, 'ClientNoAction'],
    ['NoAction', true, 'NoAction'],
    ['NoAction', false, 'ClientNoAction'],
    ['SetDefault', true, 'ClientNoAction'],
    ['SetDefault', false, 'ClientNoAction'],
    [undefined, true, 'Restrict'],
    [undefined, false, 'SetNull'],
  ] as const)(
    'maps onDelete %s on a required=%s relation to %s',
    (onDelete, isRequired, expected) => {
      expect(deleteBehavior(onDelete, isRequired)).toBe(expected)
    },
  )
})

// Every expected name is what Prisma Migrate writes for the operator class in the index DDL.
const TYPES = `datasource db {
  provider = "postgresql"
}

model Scalars {
  id       String    @id
  int      Int
  bigInt   BigInt
  float    Float
  decimal  Decimal
  boolean  Boolean
  dateTime DateTime
  json     Json
  bytes    Bytes
  maybe    String?
  count    Int?
  list     String[]
  when     DateTime[]
  amounts  Decimal[]
  docs     Json[]
}

model Natives {
  id        String   @id @db.Uuid
  text      String   @db.Text
  citext    String   @db.Citext
  varchar   String   @db.VarChar(32)
  anyLength String   @db.VarChar
  char      String   @db.Char(3)
  oneChar   String   @db.Char
  xml       String   @db.Xml
  inet      String?  @db.Inet
  bit       String   @db.Bit(8)
  bit1      String   @db.Bit
  varbit    String   @db.VarBit(16)
  varbitAny String   @db.VarBit
  small     Int      @db.SmallInt
  integer   Int      @db.Integer
  oid       Int      @db.Oid
  big       BigInt   @db.BigInt
  real      Float    @db.Real
  double    Float    @db.DoublePrecision
  money     Decimal  @db.Money
  exact     Decimal  @db.Decimal(10, 2)
  numeric   Decimal  @db.Decimal
  stamp     DateTime @db.Timestamp(0)
  stampAny  DateTime @db.Timestamp
  zoned     DateTime @db.Timestamptz(6)
  zonedAny  DateTime @db.Timestamptz
  day       DateTime @db.Date
  clock     DateTime @db.Time(3)
  clockAny  DateTime @db.Time
  clockTz   DateTime @db.Timetz(3)
  clockTzAny DateTime? @db.Timetz
  json      Json     @db.Json
  jsonb     Json     @db.JsonB
  bytea     Bytes    @db.ByteA
  bool      Boolean  @db.Boolean
  names     String[] @db.VarChar(20)
  ids       String[] @db.Uuid
  days      DateTime[] @db.Date
}
`

const DEFAULTS = `datasource db {
  provider = "postgresql"
}

model Literal {
  id       Int      @id @default(autoincrement())
  text     String   @default("say \\"hi\\"\\n\\tC:\\\\path")
  int      Int      @default(-7)
  small    Int      @default(-1) @db.SmallInt
  oid      Int      @default(7) @db.Oid
  big      BigInt   @default(9007199254740993)
  float    Float    @default(1)
  real     Float    @default(2.5) @db.Real
  decimal  Decimal  @default(0.1)
  boolean  Boolean  @default(true)
  json     Json     @default("{\\"a\\":[1]}")
  bytes    Bytes    @default("aGk=")
  guid     String   @default("8f1d3b4a-2c6e-4f7a-9b0c-1d2e3f4a5b6c") @db.Uuid
  maybe    String?  @default("x")
  tags     String[] @default(["a", "b"])
  none     Int[]    @default([])
  stamp    DateTime @default("2020-01-01T12:34:56.123456+09:00")
  zoned    DateTime @default("2020-01-01T12:34:56.123456+09:00") @db.Timestamptz(6)
  day      DateTime @default("2020-01-01T23:00:00-05:00") @db.Date
  clock    DateTime @default("2020-01-01T08:09:10.5Z") @db.Time(3)
  clockTz  DateTime @default("2020-01-01T08:09:10Z") @db.Timetz
  stamps   DateTime[] @default(["2020-01-01T00:00:00+09:00"])
  bits     String   @default("101") @db.VarBit
}

model Generated {
  id      String   @id @default(uuid(7))
  v4      String   @default(uuid())
  guid    String   @default(uuid()) @db.Uuid
  guid7   String   @default(uuid(7)) @db.Uuid
  ulid    String   @default(ulid())
  cuid    String   @default(cuid())
  cuid2   String?  @default(cuid(2))
  nano    String   @default(nanoid())
  nano8   String   @default(nanoid(8))
  created DateTime @default(now())
  sql     String   @default(dbgenerated("md5(random()::text)"))
  trigger Int?     @default(dbgenerated())
  label   String?  @default(dbgenerated())
  serial  Int      @default(autoincrement())
}

model Counter {
  seq  Int    @default(autoincrement())
  book String

  @@id([book, seq])
}

model Plain {
  id   Int    @id
  guid String @unique @db.Uuid
}
`

const ENUMS = `datasource db {
  provider = "postgresql"
}

enum Status {
  ACTIVE
  PENDING_REVIEW
}

enum Level {
  FOO_BAR
  FooBar  @map("foo-bar")

  @@map("level")
}

model Ticket {
  id       Int      @id
  status   Status   @default(PENDING_REVIEW)
  level    Level?   @default(FooBar)
  levels   Level[]  @default([FOO_BAR])
}

model Shadow {
  id     Int    @id
  status Level  @default(FOO_BAR)
  mood   Status @default(ACTIVE)
}
`

const UPDATED_AT = `datasource db {
  provider = "postgresql"
}

model Stamped {
  id      Int       @id
  plain   DateTime  @updatedAt
  zoned   DateTime  @updatedAt @db.Timestamptz(3)
  day     DateTime? @updatedAt @db.Date
  clock   DateTime  @updatedAt @db.Time
  clockTz DateTime  @updatedAt @db.Timetz
}

model Other {
  id        Int      @id
  updatedAt DateTime @updatedAt @map("updated_at")
}
`

const RELATIONS = `datasource db {
  provider = "postgresql"
}

model User {
  id      Int      @id
  email   String   @unique
  handle  String   @unique
  profile Profile?
  badges  Badge[]
}

model Profile {
  id     Int    @id
  email  String @unique
  user   User   @relation(fields: [email], references: [email], onDelete: Cascade)
}

model Badge {
  id     Int     @id
  handle String?
  user   User?   @relation(fields: [handle], references: [handle], onDelete: Restrict)
}

model Cell {
  x    Int
  y    Int
  pins Pin[]

  @@id([x, y])
}

model Pin {
  id   Int  @id
  b    Int
  a    Int
  cell Cell @relation(fields: [b, a], references: [y, x], onDelete: NoAction)
}

model Node {
  id       Int     @id
  parentId Int?
  parent   Node?   @relation("tree", fields: [parentId], references: [id], onDelete: NoAction)
  children Node[]  @relation("tree")
  nextId   Int?    @unique
  next     Node?   @relation("chain", fields: [nextId], references: [id], onDelete: SetDefault)
  previous Node?   @relation("chain")
}
`

const MANY_TO_MANY = `datasource db {
  provider = "postgresql"
  schemas  = ["public", "audit"]
}

model Tag {
  id    String @id @db.VarChar(12)
  posts Post[]

  @@schema("audit")
}

model Post {
  id     Int    @id
  tags   Tag[]
  actors Person[] @relation("cast")

  @@schema("public")
}

model Person {
  id       Int      @id
  films    Post[]   @relation("cast")
  friends  Person[] @relation("friendship")
  friendOf Person[] @relation("friendship")
  others   AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit[]

  @@schema("audit")
}

model AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit {
  id     Int      @id
  people Person[]

  @@schema("public")
}
`

const NAMES = `datasource db {
  provider = "postgresql"
}

model order_item {
  id Int @id
}

model OrderItem {
  id Int @id
}

model Orderitem {
  id Int @id
}

model AppDbContext {
  id Int @id
}

model Person {
  id Int @id
}

model People {
  id Int @id
}

model Task {
  id        Int      @id
  task      String
  userId    Int
  UserId    Int
  user_id   Int
  toString  String
  updatedAt DateTime @updatedAt
}

model DeleteBehavior {
  id    Int    @id
  items List[]
}

model List {
  id      Int            @id
  ownerId Int
  owner   DeleteBehavior @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  convert Bytes          @default("aGk=")
}
`

const KEYS = `datasource db {
  provider = "postgresql"
}

model Keyed {
  a    Int
  b    String
  tags String[]
  doc  Json
  at   DateTime
  geo  String
  n    Int
  addr String @db.Inet
  u    String @db.Uuid

  @@id([b, a], map: "keyed_pk")
  @@unique([a(sort: Desc), b], map: "keyed_ab_key")
  @@index([tags], type: Gin)
  @@index([doc], type: Gin)
  @@index([at(sort: Desc)])
  @@index([geo], type: SpGist)
  @@index([n], type: Brin)
  @@index([b], type: BTree)
  @@index([a], type: Hash, map: "keyed_a_hash")
  @@index([addr(ops: InetOps)], type: Gist)
  @@index([n, u(ops: UuidMinMaxMultiOps)], type: Brin, map: "keyed_n_u_brin")
  @@index([b(ops: raw("text_pattern_ops"))], map: "keyed_b_pattern")
}

model Unkeyed {
  code  String  @unique
  alt   Int?    @unique
  label String

  @@unique([label, code])
}
`

const COMMENTS = `datasource db {
  provider = "postgresql"
}

/// Mood of a <b>user</b> & friends.
enum Mood {
  HAPPY
}

/// A user.
/// Second line with "quotes".
/// @z.object({})
model User {
  /// Primary key
  /// @z.uuid()
  id    String @id @default(uuid())
  /// @v.pipe(v.string(), v.email())
  email String
  mood  Mood   @default(HAPPY)
}
`

// Each fixture's output was read line by line against what `dotnet ef dbcontext scaffold` writes for
// the same database, and the shapes it covers are compiled and run against PostgreSQL by
// test/harness/efcore.

describe('entityFile, enumFile and contextFile', () => {
  it('maps every Prisma scalar and PostgreSQL native type as the scaffolder does', () => {
    const { datamodel, plan } = fixture(TYPES)
    expect(entityFile(plan, model(datamodel, 'Scalars'))).toStrictEqual({
      fileName: 'Scalars.cs',
      code: `#nullable enable

using System;
using System.Collections.Generic;

namespace Models;

public partial class Scalars
{
    public string Id { get; set; } = null!;

    public int Int { get; set; }

    public long BigInt { get; set; }

    public double Float { get; set; }

    public decimal Decimal { get; set; }

    public bool Boolean { get; set; }

    public DateTime DateTime { get; set; }

    public string Json { get; set; } = null!;

    public byte[] Bytes { get; set; } = null!;

    public string? Maybe { get; set; }

    public int? Count { get; set; }

    public List<string>? List { get; set; }

    public List<DateTime>? When { get; set; }

    public List<decimal>? Amounts { get; set; }

    public List<string>? Docs { get; set; }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Natives'))).toStrictEqual({
      fileName: 'Natives.cs',
      code: `#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using NpgsqlTypes;

namespace Models;

public partial class Natives
{
    public Guid Id { get; set; }

    public string Text { get; set; } = null!;

    public string Citext { get; set; } = null!;

    public string Varchar { get; set; } = null!;

    public string AnyLength { get; set; } = null!;

    public string Char { get; set; } = null!;

    public string OneChar { get; set; } = null!;

    public string Xml { get; set; } = null!;

    public NpgsqlInet? Inet { get; set; }

    public BitArray Bit { get; set; } = null!;

    public BitArray Bit1 { get; set; } = null!;

    public BitArray Varbit { get; set; } = null!;

    public BitArray VarbitAny { get; set; } = null!;

    public short Small { get; set; }

    public int Integer { get; set; }

    public uint Oid { get; set; }

    public long Big { get; set; }

    public float Real { get; set; }

    public double Double { get; set; }

    public decimal Money { get; set; }

    public decimal Exact { get; set; }

    public decimal Numeric { get; set; }

    public DateTime Stamp { get; set; }

    public DateTime StampAny { get; set; }

    public DateTime Zoned { get; set; }

    public DateTime ZonedAny { get; set; }

    public DateOnly Day { get; set; }

    public TimeOnly Clock { get; set; }

    public TimeOnly ClockAny { get; set; }

    public DateTimeOffset ClockTz { get; set; }

    public DateTimeOffset? ClockTzAny { get; set; }

    public string Json { get; set; } = null!;

    public string Jsonb { get; set; } = null!;

    public byte[] Bytea { get; set; } = null!;

    public bool Bool { get; set; }

    public List<string>? Names { get; set; }

    public List<Guid>? Ids { get; set; }

    public List<DateOnly>? Days { get; set; }
}
`,
    })
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Scalars> Scalars { get; set; }

    public virtual DbSet<Natives> Natives { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Scalars>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Scalars_pkey");

            entity.ToTable("Scalars");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Int).HasColumnName("int");
            entity.Property(e => e.BigInt).HasColumnName("bigInt");
            entity.Property(e => e.Float).HasColumnName("float");
            entity.Property(e => e.Decimal)
                .HasPrecision(65, 30)
                .HasColumnName("decimal");
            entity.Property(e => e.Boolean).HasColumnName("boolean");
            entity.Property(e => e.DateTime)
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("dateTime");
            entity.Property(e => e.Json)
                .HasColumnType("jsonb")
                .HasColumnName("json");
            entity.Property(e => e.Bytes).HasColumnName("bytes");
            entity.Property(e => e.Maybe).HasColumnName("maybe");
            entity.Property(e => e.Count).HasColumnName("count");
            entity.Property(e => e.List).HasColumnName("list");
            entity.Property(e => e.When)
                .HasColumnType("timestamp(3) without time zone[]")
                .HasColumnName("when");
            entity.Property(e => e.Amounts)
                .HasColumnType("numeric(65,30)[]")
                .HasColumnName("amounts");
            entity.Property(e => e.Docs)
                .HasColumnType("jsonb[]")
                .HasColumnName("docs");
        });

        modelBuilder.Entity<Natives>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Natives_pkey");

            entity.ToTable("Natives");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Text).HasColumnName("text");
            entity.Property(e => e.Citext)
                .HasColumnType("citext")
                .HasColumnName("citext");
            entity.Property(e => e.Varchar)
                .HasMaxLength(32)
                .HasColumnName("varchar");
            entity.Property(e => e.AnyLength)
                .HasColumnType("character varying")
                .HasColumnName("anyLength");
            entity.Property(e => e.Char)
                .HasMaxLength(3)
                .IsFixedLength()
                .HasColumnName("char");
            entity.Property(e => e.OneChar)
                .HasMaxLength(1)
                .IsFixedLength()
                .HasColumnName("oneChar");
            entity.Property(e => e.Xml)
                .HasColumnType("xml")
                .HasColumnName("xml");
            entity.Property(e => e.Inet).HasColumnName("inet");
            entity.Property(e => e.Bit)
                .HasColumnType("bit(8)")
                .HasColumnName("bit");
            entity.Property(e => e.Bit1)
                .HasColumnType("bit(1)")
                .HasColumnName("bit1");
            entity.Property(e => e.Varbit)
                .HasMaxLength(16)
                .HasColumnName("varbit");
            entity.Property(e => e.VarbitAny).HasColumnName("varbitAny");
            entity.Property(e => e.Small).HasColumnName("small");
            entity.Property(e => e.Integer).HasColumnName("integer");
            entity.Property(e => e.Oid)
                .HasColumnType("oid")
                .HasColumnName("oid");
            entity.Property(e => e.Big).HasColumnName("big");
            entity.Property(e => e.Real).HasColumnName("real");
            entity.Property(e => e.Double).HasColumnName("double");
            entity.Property(e => e.Money)
                .HasColumnType("money")
                .HasColumnName("money");
            entity.Property(e => e.Exact)
                .HasPrecision(10, 2)
                .HasColumnName("exact");
            entity.Property(e => e.Numeric).HasColumnName("numeric");
            entity.Property(e => e.Stamp)
                .HasColumnType("timestamp(0) without time zone")
                .HasColumnName("stamp");
            entity.Property(e => e.StampAny)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("stampAny");
            entity.Property(e => e.Zoned)
                .HasPrecision(6)
                .HasColumnName("zoned");
            entity.Property(e => e.ZonedAny).HasColumnName("zonedAny");
            entity.Property(e => e.Day).HasColumnName("day");
            entity.Property(e => e.Clock)
                .HasPrecision(3)
                .HasColumnName("clock");
            entity.Property(e => e.ClockAny).HasColumnName("clockAny");
            entity.Property(e => e.ClockTz)
                .HasColumnType("time(3) with time zone")
                .HasColumnName("clockTz");
            entity.Property(e => e.ClockTzAny)
                .HasColumnType("time with time zone")
                .HasColumnName("clockTzAny");
            entity.Property(e => e.Json)
                .HasColumnType("json")
                .HasColumnName("json");
            entity.Property(e => e.Jsonb)
                .HasColumnType("jsonb")
                .HasColumnName("jsonb");
            entity.Property(e => e.Bytea).HasColumnName("bytea");
            entity.Property(e => e.Bool).HasColumnName("bool");
            entity.Property(e => e.Names)
                .HasColumnType("character varying(20)[]")
                .HasColumnName("names");
            entity.Property(e => e.Ids).HasColumnName("ids");
            entity.Property(e => e.Days).HasColumnName("days");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`,
    })
  })

  it('gives each default the value Prisma Client writes, and the column the DEFAULT Prisma Migrate writes', () => {
    const { datamodel, plan } = fixture(DEFAULTS)
    expect(entityFile(plan, model(datamodel, 'Literal'))).toStrictEqual({
      fileName: 'Literal.cs',
      code: `#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;

namespace Models;

public partial class Literal
{
    public int Id { get; set; }

    public string Text { get; set; } = "say \\"hi\\"\\n\\tC:\\\\path";

    public int Int { get; set; } = -7;

    public short Small { get; set; } = (short)-1;

    public uint Oid { get; set; } = 7u;

    public long Big { get; set; } = 9007199254740993L;

    public double Float { get; set; } = 1.0;

    public float Real { get; set; } = 2.5f;

    public decimal Decimal { get; set; } = 0.1m;

    public bool Boolean { get; set; } = true;

    public string Json { get; set; } = "{\\"a\\":[1]}";

    public byte[] Bytes { get; set; } = Convert.FromBase64String("aGk=");

    public Guid Guid { get; set; } = new Guid("8f1d3b4a-2c6e-4f7a-9b0c-1d2e3f4a5b6c");

    public string? Maybe { get; set; } = "x";

    public List<string>? Tags { get; set; } = new List<string> { "a", "b" };

    public List<int>? None { get; set; } = new List<int>();

    public DateTime Stamp { get; set; } = new DateTime(2020, 1, 1, 3, 34, 56, 123, 456, DateTimeKind.Unspecified);

    public DateTime Zoned { get; set; } = new DateTime(2020, 1, 1, 3, 34, 56, 123, 456, DateTimeKind.Utc);

    public DateOnly Day { get; set; } = new DateOnly(2020, 1, 2);

    public TimeOnly Clock { get; set; } = new TimeOnly(8, 9, 10, 500);

    public DateTimeOffset ClockTz { get; set; }

    public List<DateTime>? Stamps { get; set; } = new List<DateTime> { new DateTime(2019, 12, 31, 15, 0, 0, 0, DateTimeKind.Unspecified) };

    public BitArray Bits { get; set; } = null!;
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Generated'))).toStrictEqual({
      fileName: 'Generated.cs',
      code: `#nullable enable

using System;
using Visus.Cuid;

namespace Models;

public partial class Generated
{
    public string Id { get; set; } = null!;

    public string V4 { get; set; } = null!;

    public Guid Guid { get; set; }

    public Guid Guid7 { get; set; }

    public string Ulid { get; set; } = null!;

    public string Cuid { get; set; } = null!;

    public string? Cuid2 { get; set; } = new Cuid2().ToString();

    public string Nano { get; set; } = null!;

    public string Nano8 { get; set; } = null!;

    public DateTime Created { get; set; }

    public string Sql { get; set; } = null!;

    public int? Trigger { get; set; }

    public string? Label { get; set; }

    public int Serial { get; set; }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Counter'))).toStrictEqual({
      fileName: 'Counter.cs',
      code: `#nullable enable

namespace Models;

public partial class Counter
{
    public int Seq { get; set; }

    public string Book { get; set; } = null!;
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Plain'))).toStrictEqual({
      fileName: 'Plain.cs',
      code: `#nullable enable

using System;

namespace Models;

public partial class Plain
{
    public int Id { get; set; }

    public Guid Guid { get; set; }
}
`,
    })
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Microsoft.EntityFrameworkCore.ValueGeneration;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using Visus.Cuid;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Literal> Literals { get; set; }

    public virtual DbSet<Generated> Generateds { get; set; }

    public virtual DbSet<Counter> Counters { get; set; }

    public virtual DbSet<Plain> Plains { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Literal>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Literal_pkey");

            entity.ToTable("Literal");

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.Text)
                .ValueGeneratedNever()
                .HasDefaultValue("say \\"hi\\"\\n\\tC:\\\\path")
                .HasColumnName("text");
            entity.Property(e => e.Int)
                .ValueGeneratedNever()
                .HasDefaultValue(-7)
                .HasColumnName("int");
            entity.Property(e => e.Small)
                .ValueGeneratedNever()
                .HasDefaultValue((short)-1)
                .HasColumnName("small");
            entity.Property(e => e.Oid)
                .ValueGeneratedNever()
                .HasDefaultValue(7u)
                .HasColumnType("oid")
                .HasColumnName("oid");
            entity.Property(e => e.Big)
                .ValueGeneratedNever()
                .HasDefaultValue(9007199254740993L)
                .HasColumnName("big");
            entity.Property(e => e.Float)
                .ValueGeneratedNever()
                .HasDefaultValue(1.0)
                .HasColumnName("float");
            entity.Property(e => e.Real)
                .ValueGeneratedNever()
                .HasDefaultValue(2.5f)
                .HasColumnName("real");
            entity.Property(e => e.Decimal)
                .ValueGeneratedNever()
                .HasPrecision(65, 30)
                .HasDefaultValue(0.1m)
                .HasColumnName("decimal");
            entity.Property(e => e.Boolean)
                .ValueGeneratedNever()
                .HasDefaultValue(true)
                .HasColumnName("boolean");
            entity.Property(e => e.Json)
                .ValueGeneratedNever()
                .HasDefaultValue("{\\"a\\":[1]}")
                .HasColumnType("jsonb")
                .HasColumnName("json");
            entity.Property(e => e.Bytes)
                .ValueGeneratedNever()
                .HasDefaultValue(Convert.FromBase64String("aGk="))
                .HasColumnName("bytes");
            entity.Property(e => e.Guid)
                .ValueGeneratedNever()
                .HasDefaultValue(new Guid("8f1d3b4a-2c6e-4f7a-9b0c-1d2e3f4a5b6c"))
                .HasColumnName("guid");
            entity.Property(e => e.Maybe)
                .ValueGeneratedNever()
                .HasDefaultValue("x")
                .HasColumnName("maybe");
            entity.Property(e => e.Tags)
                .ValueGeneratedNever()
                .HasDefaultValue(new List<string> { "a", "b" })
                .HasColumnName("tags");
            entity.Property(e => e.None)
                .ValueGeneratedNever()
                .HasDefaultValue(new List<int>())
                .HasColumnName("none");
            entity.Property(e => e.Stamp)
                .ValueGeneratedNever()
                .HasDefaultValueSql("'2020-01-01 12:34:56.123456 +09:00'")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("stamp");
            entity.Property(e => e.Zoned)
                .ValueGeneratedNever()
                .HasPrecision(6)
                .HasDefaultValueSql("'2020-01-01 12:34:56.123456 +09:00'")
                .HasColumnName("zoned");
            entity.Property(e => e.Day)
                .ValueGeneratedNever()
                .HasDefaultValueSql("'2020-01-01 23:00:00 -05:00'")
                .HasColumnName("day");
            entity.Property(e => e.Clock)
                .ValueGeneratedNever()
                .HasPrecision(3)
                .HasDefaultValueSql("'2020-01-01 08:09:10.500 +00:00'")
                .HasColumnName("clock");
            entity.Property(e => e.ClockTz)
                .HasDefaultValueSql("'2020-01-01 08:09:10 +00:00'")
                .HasColumnType("time with time zone")
                .HasColumnName("clockTz");
            entity.Property(e => e.Stamps)
                .ValueGeneratedNever()
                .HasDefaultValueSql("'{\\"2020-01-01 00:00:00 +09:00\\"}'")
                .HasColumnType("timestamp(3) without time zone[]")
                .HasColumnName("stamps");
            entity.Property(e => e.Bits)
                .HasDefaultValueSql("'101'")
                .HasColumnName("bits");
        });

        modelBuilder.Entity<Generated>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Generated_pkey");

            entity.ToTable("Generated");

            entity.Property(e => e.Id)
                .HasValueGenerator<UuidV7StringGenerator>()
                .HasColumnName("id");
            entity.Property(e => e.V4)
                .HasValueGenerator<UuidV4StringGenerator>()
                .HasColumnName("v4");
            entity.Property(e => e.Guid)
                .HasValueGenerator<UuidV4GuidGenerator>()
                .HasColumnName("guid");
            entity.Property(e => e.Guid7)
                .HasValueGenerator<UuidV7GuidGenerator>()
                .HasColumnName("guid7");
            entity.Property(e => e.Ulid)
                .HasValueGenerator<UlidGenerator>()
                .HasColumnName("ulid");
            entity.Property(e => e.Cuid)
                .HasValueGenerator<CuidGenerator>()
                .HasColumnName("cuid");
            entity.Property(e => e.Cuid2).HasColumnName("cuid2");
            entity.Property(e => e.Nano)
                .HasValueGenerator<Nanoid21Generator>()
                .HasColumnName("nano");
            entity.Property(e => e.Nano8)
                .HasValueGenerator<Nanoid8Generator>()
                .HasColumnName("nano8");
            entity.Property(e => e.Created)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("created");
            entity.Property(e => e.Sql)
                .HasDefaultValueSql("md5(random()::text)")
                .HasColumnName("sql");
            entity.Property(e => e.Trigger)
                .ValueGeneratedOnAdd()
                .HasColumnName("trigger")
                .Metadata.SetValueGenerationStrategy(NpgsqlValueGenerationStrategy.None);
            entity.Property(e => e.Label)
                .ValueGeneratedOnAdd()
                .HasColumnName("label");
            entity.Property(e => e.Serial)
                .ValueGeneratedOnAdd()
                .UseSerialColumn()
                .HasColumnName("serial");
        });

        modelBuilder.Entity<Counter>(entity =>
        {
            entity.HasKey(e => new { e.Book, e.Seq }).HasName("Counter_pkey");

            entity.ToTable("Counter");

            entity.Property(e => e.Seq)
                .ValueGeneratedOnAdd()
                .UseSerialColumn()
                .HasColumnName("seq");
            entity.Property(e => e.Book).HasColumnName("book");
        });

        modelBuilder.Entity<Plain>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Plain_pkey");

            entity.ToTable("Plain");

            entity.HasIndex(e => e.Guid, "Plain_guid_key").IsUnique();

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Guid).HasColumnName("guid");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}

file sealed class UuidV7StringGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => Guid.CreateVersion7().ToString();
}

file sealed class UuidV4StringGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => Guid.NewGuid().ToString();
}

file sealed class UuidV4GuidGenerator : ValueGenerator<Guid>
{
    public override bool GeneratesTemporaryValues => false;

    public override Guid Next(EntityEntry entry) => Guid.NewGuid();
}

file sealed class UuidV7GuidGenerator : ValueGenerator<Guid>
{
    public override bool GeneratesTemporaryValues => false;

    public override Guid Next(EntityEntry entry) => Guid.CreateVersion7();
}

file sealed class UlidGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => Ulid.NewUlid().ToString();
}

file sealed class CuidGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

#pragma warning disable VISLIB0001
    public override string Next(EntityEntry entry) => Cuid.NewCuid().ToString();
#pragma warning restore VISLIB0001
}

file sealed class Nanoid21Generator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => RandomNumberGenerator.GetString("_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 21);
}

file sealed class Nanoid8Generator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => RandomNumberGenerator.GetString("_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);
}
`,
    })
  })

  it('maps enums through [PgName], MapEnum and HasPostgresEnum, and qualifies a member a property hides', () => {
    const { datamodel, plan } = fixture(ENUMS)
    expect(entityFile(plan, model(datamodel, 'Ticket'))).toStrictEqual({
      fileName: 'Ticket.cs',
      code: `#nullable enable

using System.Collections.Generic;

namespace Models;

public partial class Ticket
{
    public int Id { get; set; }

    public Status Status { get; set; } = Status.PendingReview;

    public Level? Level { get; set; } = global::Models.Level.FooBar1;

    public List<Level>? Levels { get; set; } = new List<Level> { global::Models.Level.FooBar };
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Shadow'))).toStrictEqual({
      fileName: 'Shadow.cs',
      code: `#nullable enable

namespace Models;

public partial class Shadow
{
    public int Id { get; set; }

    public Level Status { get; set; } = Level.FooBar;

    public Status Mood { get; set; } = global::Models.Status.Active;
}
`,
    })
    expect(enumFile(plan, enumOf(datamodel, 'Status'))).toStrictEqual({
      fileName: 'Status.cs',
      code: `#nullable enable

using NpgsqlTypes;

namespace Models;

public enum Status
{
    [PgName("ACTIVE")]
    Active,

    [PgName("PENDING_REVIEW")]
    PendingReview,
}
`,
    })
    expect(enumFile(plan, enumOf(datamodel, 'Level'))).toStrictEqual({
      fileName: 'Level.cs',
      code: `#nullable enable

using NpgsqlTypes;

namespace Models;

public enum Level
{
    [PgName("FOO_BAR")]
    FooBar,

    [PgName("foo-bar")]
    FooBar1,
}
`,
    })
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Ticket> Tickets { get; set; }

    public virtual DbSet<Shadow> Shadows { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
        npgsql.MapEnum<Status>("Status");
        npgsql.MapEnum<Level>("level");
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
        dataSource.MapEnum<Status>("Status");
        dataSource.MapEnum<Level>("level");
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresEnum<Status>(name: "Status");
        modelBuilder.HasPostgresEnum<Level>(name: "level");

        modelBuilder.Entity<Ticket>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Ticket_pkey");

            entity.ToTable("Ticket");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Status)
                .ValueGeneratedNever()
                .HasDefaultValue(Status.PendingReview)
                .HasColumnName("status");
            entity.Property(e => e.Level)
                .ValueGeneratedNever()
                .HasDefaultValue(Level.FooBar1)
                .HasColumnName("level");
            entity.Property(e => e.Levels)
                .ValueGeneratedNever()
                .HasDefaultValue(new List<Level> { Level.FooBar })
                .HasColumnName("levels");
        });

        modelBuilder.Entity<Shadow>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Shadow_pkey");

            entity.ToTable("Shadow");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Status)
                .ValueGeneratedNever()
                .HasDefaultValue(Level.FooBar)
                .HasColumnName("status");
            entity.Property(e => e.Mood)
                .ValueGeneratedNever()
                .HasDefaultValue(Status.Active)
                .HasColumnName("mood");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`,
    })
  })

  it('stamps @updatedAt fields in SaveChanges with the value their column type takes', () => {
    const { plan } = fixture(UPDATED_AT)
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Stamped> Stampeds { get; set; }

    public virtual DbSet<Other> Others { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Stamped>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Stamped_pkey");

            entity.ToTable("Stamped");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Plain)
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("plain");
            entity.Property(e => e.Zoned)
                .HasPrecision(3)
                .HasColumnName("zoned");
            entity.Property(e => e.Day).HasColumnName("day");
            entity.Property(e => e.Clock).HasColumnName("clock");
            entity.Property(e => e.ClockTz)
                .HasColumnType("time with time zone")
                .HasColumnName("clockTz");
        });

        modelBuilder.Entity<Other>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Other_pkey");

            entity.ToTable("Other");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.UpdatedAt)
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("updated_at");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampUpdatedAt();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampUpdatedAt();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void StampUpdatedAt()
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries<Stamped>())
        {
            if ((entry.State == EntityState.Added && entry.Entity.Plain == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.Plain).IsModified))
            {
                entry.Entity.Plain = DateTime.SpecifyKind(now, DateTimeKind.Unspecified);
            }

            if ((entry.State == EntityState.Added && entry.Entity.Zoned == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.Zoned).IsModified))
            {
                entry.Entity.Zoned = now;
            }

            if ((entry.State == EntityState.Added && entry.Entity.Day == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.Day).IsModified))
            {
                entry.Entity.Day = DateOnly.FromDateTime(now);
            }

            if ((entry.State == EntityState.Added && entry.Entity.Clock == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.Clock).IsModified))
            {
                entry.Entity.Clock = TimeOnly.FromDateTime(now);
            }

            if ((entry.State == EntityState.Added && entry.Entity.ClockTz == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.ClockTz).IsModified))
            {
                entry.Entity.ClockTz = new DateTimeOffset(now);
            }
        }

        foreach (var entry in ChangeTracker.Entries<Other>())
        {
            if ((entry.State == EntityState.Added && entry.Entity.UpdatedAt == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.UpdatedAt).IsModified))
            {
                entry.Entity.UpdatedAt = DateTime.SpecifyKind(now, DateTimeKind.Unspecified);
            }
        }
    }
}
`,
    })
  })

  it('configures each foreign key on its dependent, with alternate keys and delete behaviors', () => {
    const { datamodel, plan } = fixture(RELATIONS)
    expect(entityFile(plan, model(datamodel, 'User'))).toStrictEqual({
      fileName: 'User.cs',
      code: `#nullable enable

using System.Collections.Generic;

namespace Models;

public partial class User
{
    public int Id { get; set; }

    public string Email { get; set; } = null!;

    public string Handle { get; set; } = null!;

    public virtual Profile? Profile { get; set; }

    public virtual ICollection<Badge> Badges { get; set; } = new List<Badge>();
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Node'))).toStrictEqual({
      fileName: 'Node.cs',
      code: `#nullable enable

using System.Collections.Generic;

namespace Models;

public partial class Node
{
    public int Id { get; set; }

    public int? ParentId { get; set; }

    public virtual Node? Parent { get; set; }

    public virtual ICollection<Node> Children { get; set; } = new List<Node>();

    public int? NextId { get; set; }

    public virtual Node? Next { get; set; }

    public virtual Node? Previous { get; set; }
}
`,
    })
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<Profile> Profiles { get; set; }

    public virtual DbSet<Badge> Badges { get; set; }

    public virtual DbSet<Cell> Cells { get; set; }

    public virtual DbSet<Pin> Pins { get; set; }

    public virtual DbSet<Node> Nodes { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("User_pkey");

            entity.ToTable("User");

            entity.HasAlternateKey(e => e.Email).HasName("User_email_key");

            entity.HasAlternateKey(e => e.Handle).HasName("User_handle_key");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.Handle).HasColumnName("handle");
        });

        modelBuilder.Entity<Profile>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Profile_pkey");

            entity.ToTable("Profile");

            entity.HasIndex(e => e.Email, "Profile_email_key").IsUnique();

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Email).HasColumnName("email");

            entity.HasOne(d => d.User).WithOne(p => p.Profile)
                .HasPrincipalKey<User>(p => p.Email)
                .HasForeignKey<Profile>(d => d.Email)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("Profile_email_fkey");
        });

        modelBuilder.Entity<Badge>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Badge_pkey");

            entity.ToTable("Badge");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Handle).HasColumnName("handle");

            entity.HasOne(d => d.User).WithMany(p => p.Badges)
                .HasPrincipalKey(p => p.Handle)
                .HasForeignKey(d => d.Handle)
                .OnDelete(DeleteBehavior.ClientNoAction)
                .HasConstraintName("Badge_handle_fkey");
        });

        modelBuilder.Entity<Cell>(entity =>
        {
            entity.HasKey(e => new { e.X, e.Y }).HasName("Cell_pkey");

            entity.ToTable("Cell");

            entity.Property(e => e.X).HasColumnName("x");
            entity.Property(e => e.Y).HasColumnName("y");
        });

        modelBuilder.Entity<Pin>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Pin_pkey");

            entity.ToTable("Pin");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.B).HasColumnName("b");
            entity.Property(e => e.A).HasColumnName("a");

            entity.HasOne(d => d.Cell).WithMany(p => p.Pins)
                .HasForeignKey(d => new { d.A, d.B })
                .OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("Pin_b_a_fkey");
        });

        modelBuilder.Entity<Node>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Node_pkey");

            entity.ToTable("Node");

            entity.HasIndex(e => e.NextId, "Node_nextId_key").IsUnique();

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.ParentId).HasColumnName("parentId");
            entity.Property(e => e.NextId).HasColumnName("nextId");

            entity.HasOne(d => d.Parent).WithMany(p => p.Children)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.ClientNoAction)
                .HasConstraintName("Node_parentId_fkey");

            entity.HasOne(d => d.Next).WithOne(p => p.Previous)
                .HasForeignKey<Node>(d => d.NextId)
                .OnDelete(DeleteBehavior.ClientNoAction)
                .HasConstraintName("Node_nextId_fkey");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`,
    })
  })

  it('maps implicit many-to-many relations onto the _A/_B join tables Prisma creates', () => {
    const { datamodel, plan } = fixture(MANY_TO_MANY)
    expect(entityFile(plan, model(datamodel, 'Person'))).toStrictEqual({
      fileName: 'Person.cs',
      code: `#nullable enable

using System.Collections.Generic;

namespace Models;

public partial class Person
{
    public int Id { get; set; }

    public virtual ICollection<Post> Films { get; set; } = new List<Post>();

    public virtual ICollection<Person> Friends { get; set; } = new List<Person>();

    public virtual ICollection<Person> FriendOf { get; set; } = new List<Person>();

    public virtual ICollection<AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit> Others { get; set; } = new List<AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit>();
}
`,
    })
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Tag> Tags { get; set; }

    public virtual DbSet<Post> Posts { get; set; }

    public virtual DbSet<Person> People { get; set; }

    public virtual DbSet<AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit> AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimits { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tag>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Tag_pkey");

            entity.ToTable("Tag", "audit");

            entity.Property(e => e.Id)
                .HasMaxLength(12)
                .HasColumnName("id");
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Post_pkey");

            entity.ToTable("Post", "public");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");

            entity.HasMany(d => d.Tags).WithMany(p => p.Posts)
                .UsingEntity<Dictionary<string, object>>(
                    "_PostToTag",
                    r => r.HasOne<Tag>().WithMany()
                        .HasForeignKey("B")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_PostToTag_B_fkey"),
                    l => l.HasOne<Post>().WithMany()
                        .HasForeignKey("A")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_PostToTag_A_fkey"),
                    j =>
                    {
                        j.HasKey("A", "B").HasName("_PostToTag_AB_pkey");
                        j.ToTable("_PostToTag", "public");
                        j.HasIndex(new[] { "B" }, "_PostToTag_B_index");
                    });
        });

        modelBuilder.Entity<Person>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Person_pkey");

            entity.ToTable("Person", "audit");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");

            entity.HasMany(d => d.Films).WithMany(p => p.Actors)
                .UsingEntity<Dictionary<string, object>>(
                    "_cast",
                    r => r.HasOne<Post>().WithMany()
                        .HasForeignKey("B")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_cast_B_fkey"),
                    l => l.HasOne<Person>().WithMany()
                        .HasForeignKey("A")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_cast_A_fkey"),
                    j =>
                    {
                        j.HasKey("A", "B").HasName("_cast_AB_pkey");
                        j.ToTable("_cast", "audit");
                        j.HasIndex(new[] { "B" }, "_cast_B_index");
                    });

            entity.HasMany(d => d.FriendOf).WithMany(p => p.Friends)
                .UsingEntity<Dictionary<string, object>>(
                    "_friendship",
                    r => r.HasOne<Person>().WithMany()
                        .HasForeignKey("B")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_friendship_B_fkey"),
                    l => l.HasOne<Person>().WithMany()
                        .HasForeignKey("A")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_friendship_A_fkey"),
                    j =>
                    {
                        j.HasKey("A", "B").HasName("_friendship_AB_pkey");
                        j.ToTable("_friendship", "audit");
                        j.HasIndex(new[] { "B" }, "_friendship_B_index");
                    });
        });

        modelBuilder.Entity<AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastT_pkey");

            entity.ToTable("AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit", "public");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");

            entity.HasMany(d => d.People).WithMany(p => p.Others)
                .UsingEntity<Dictionary<string, object>>(
                    "_AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLi",
                    r => r.HasOne<Person>().WithMany()
                        .HasForeignKey("B")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_AnotherModelWithANameLongEnoughToPushTheJoinTableNamePa_B_fkey"),
                    l => l.HasOne<AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLimit>().WithMany()
                        .HasForeignKey("A")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_AnotherModelWithANameLongEnoughToPushTheJoinTableNamePa_A_fkey"),
                    j =>
                    {
                        j.HasKey("A", "B").HasName("_AnotherModelWithANameLongEnoughToPushTheJoinTableNameP_AB_pkey");
                        j.ToTable("_AnotherModelWithANameLongEnoughToPushTheJoinTableNamePastTheLi", "public");
                        j.HasIndex(new[] { "B" }, "_AnotherModelWithANameLongEnoughToPushTheJoinTableNameP_B_index");
                    });
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`,
    })
  })

  it('keeps every C# name unique and qualifies a framework type a model name hides', () => {
    const { datamodel, plan } = fixture(NAMES)
    expect(entityFile(plan, model(datamodel, 'OrderItem'))).toStrictEqual({
      fileName: 'OrderItem1.cs',
      code: `#nullable enable

namespace Models;

public partial class OrderItem1
{
    public int Id { get; set; }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'order_item'))).toStrictEqual({
      fileName: 'OrderItem.cs',
      code: `#nullable enable

namespace Models;

public partial class OrderItem
{
    public int Id { get; set; }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Orderitem'))).toStrictEqual({
      fileName: 'Orderitem2.cs',
      code: `#nullable enable

namespace Models;

public partial class Orderitem2
{
    public int Id { get; set; }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'AppDbContext'))).toStrictEqual({
      fileName: 'AppDbContext1.cs',
      code: `#nullable enable

namespace Models;

public partial class AppDbContext1
{
    public int Id { get; set; }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Task'))).toStrictEqual({
      fileName: 'Task.cs',
      code: `#nullable enable

using System;

namespace Models;

public partial class Task
{
    public int Id { get; set; }

    public string Task1 { get; set; } = null!;

    public int UserId { get; set; }

    public int UserId1 { get; set; }

    public int UserId2 { get; set; }

    public string ToString1 { get; set; } = null!;

    public DateTime UpdatedAt { get; set; }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'DeleteBehavior'))).toStrictEqual({
      fileName: 'DeleteBehavior.cs',
      code: `#nullable enable

using System.Collections.Generic;

namespace Models;

public partial class DeleteBehavior
{
    public int Id { get; set; }

    public virtual ICollection<List> Items { get; set; } = new global::System.Collections.Generic.List<List>();
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'List'))).toStrictEqual({
      fileName: 'List.cs',
      code: `#nullable enable

namespace Models;

public partial class List
{
    public int Id { get; set; }

    public int OwnerId { get; set; }

    public virtual DeleteBehavior Owner { get; set; } = null!;

    public byte[] Convert { get; set; } = global::System.Convert.FromBase64String("aGk=");
}
`,
    })
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using System;
using System.Threading;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<OrderItem> OrderItems { get; set; }

    public virtual DbSet<OrderItem1> OrderItem1s { get; set; }

    public virtual DbSet<Orderitem2> Orderitem2s { get; set; }

    public virtual DbSet<AppDbContext1> AppDbContext1s { get; set; }

    public virtual DbSet<Person> People { get; set; }

    public virtual DbSet<People> People1 { get; set; }

    public virtual DbSet<Task> Tasks { get; set; }

    public virtual DbSet<DeleteBehavior> DeleteBehaviors { get; set; }

    public virtual DbSet<List> Lists { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("order_item_pkey");

            entity.ToTable("order_item");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
        });

        modelBuilder.Entity<OrderItem1>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("OrderItem_pkey");

            entity.ToTable("OrderItem");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
        });

        modelBuilder.Entity<Orderitem2>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Orderitem_pkey");

            entity.ToTable("Orderitem");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
        });

        modelBuilder.Entity<AppDbContext1>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("AppDbContext_pkey");

            entity.ToTable("AppDbContext");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
        });

        modelBuilder.Entity<Person>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Person_pkey");

            entity.ToTable("Person");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
        });

        modelBuilder.Entity<People>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("People_pkey");

            entity.ToTable("People");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
        });

        modelBuilder.Entity<Task>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Task_pkey");

            entity.ToTable("Task");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Task1).HasColumnName("task");
            entity.Property(e => e.UserId).HasColumnName("userId");
            entity.Property(e => e.UserId1).HasColumnName("UserId");
            entity.Property(e => e.UserId2).HasColumnName("user_id");
            entity.Property(e => e.ToString1).HasColumnName("toString");
            entity.Property(e => e.UpdatedAt)
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("updatedAt");
        });

        modelBuilder.Entity<DeleteBehavior>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("DeleteBehavior_pkey");

            entity.ToTable("DeleteBehavior");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
        });

        modelBuilder.Entity<List>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("List_pkey");

            entity.ToTable("List");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.OwnerId).HasColumnName("ownerId");
            entity.Property(e => e.Convert)
                .ValueGeneratedNever()
                .HasDefaultValue(Convert.FromBase64String("aGk="))
                .HasColumnName("convert");

            entity.HasOne(d => d.Owner).WithMany(p => p.Items)
                .HasForeignKey(d => d.OwnerId)
                .OnDelete(global::Microsoft.EntityFrameworkCore.DeleteBehavior.Cascade)
                .HasConstraintName("List_ownerId_fkey");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampUpdatedAt();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override global::System.Threading.Tasks.Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampUpdatedAt();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void StampUpdatedAt()
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries<Task>())
        {
            if ((entry.State == EntityState.Added && entry.Entity.UpdatedAt == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.UpdatedAt).IsModified))
            {
                entry.Entity.UpdatedAt = DateTime.SpecifyKind(now, DateTimeKind.Unspecified);
            }
        }
    }
}
`,
    })
  })

  it('maps keys, unique criteria and indexes with their names, order and method', () => {
    const { plan } = fixture(KEYS)
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'AppDbContext.cs',
      code: `#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Keyed> Keyeds { get; set; }

    public virtual DbSet<Unkeyed> Unkeyeds { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Keyed>(entity =>
        {
            entity.HasKey(e => new { e.B, e.A }).HasName("keyed_pk");

            entity.ToTable("Keyed");

            entity.HasIndex(e => e.Tags, "Keyed_tags_idx").HasMethod("gin");

            entity.HasIndex(e => e.Doc, "Keyed_doc_idx").HasMethod("gin");

            entity.HasIndex(e => e.At, "Keyed_at_idx").IsDescending(true);

            entity.HasIndex(e => e.Geo, "Keyed_geo_idx").HasMethod("spgist");

            entity.HasIndex(e => e.N, "Keyed_n_idx").HasMethod("brin");

            entity.HasIndex(e => e.B, "Keyed_b_idx");

            entity.HasIndex(e => e.A, "keyed_a_hash").HasMethod("hash");

            entity.HasIndex(e => e.Addr, "Keyed_addr_idx")
                .HasMethod("gist")
                .HasOperators("inet_ops");

            entity.HasIndex(e => new { e.N, e.U }, "keyed_n_u_brin")
                .HasMethod("brin")
                .HasOperators("", "uuid_minmax_multi_ops");

            entity.HasIndex(e => e.B, "keyed_b_pattern").HasOperators("text_pattern_ops");

            entity.HasIndex(e => new { e.A, e.B }, "keyed_ab_key")
                .IsUnique()
                .IsDescending(true, false);

            entity.Property(e => e.A).HasColumnName("a");
            entity.Property(e => e.B).HasColumnName("b");
            entity.Property(e => e.Tags).HasColumnName("tags");
            entity.Property(e => e.Doc)
                .HasColumnType("jsonb")
                .HasColumnName("doc");
            entity.Property(e => e.At)
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("at");
            entity.Property(e => e.Geo).HasColumnName("geo");
            entity.Property(e => e.N).HasColumnName("n");
            entity.Property(e => e.Addr).HasColumnName("addr");
            entity.Property(e => e.U).HasColumnName("u");
        });

        modelBuilder.Entity<Unkeyed>(entity =>
        {
            entity.HasKey(e => e.Code).HasName("Unkeyed_code_key");

            entity.ToTable("Unkeyed");

            entity.HasIndex(e => e.Alt, "Unkeyed_alt_key").IsUnique();

            entity.HasIndex(e => new { e.Label, e.Code }, "Unkeyed_label_code_key").IsUnique();

            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.Alt).HasColumnName("alt");
            entity.Property(e => e.Label).HasColumnName("label");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`,
    })
  })

  it('leaves /// comments out, and writes into the namespace and DbContext it is given', () => {
    const { datamodel, plan } = fixture(COMMENTS, {
      namespace: 'Shop.Data',
      context: 'ShopContext',
    })
    expect(entityFile(plan, model(datamodel, 'User'))).toStrictEqual({
      fileName: 'User.cs',
      code: `#nullable enable

namespace Shop.Data;

public partial class User
{
    public string Id { get; set; } = null!;

    public string Email { get; set; } = null!;

    public Mood Mood { get; set; } = Mood.Happy;
}
`,
    })
    expect(enumFile(plan, enumOf(datamodel, 'Mood'))).toStrictEqual({
      fileName: 'Mood.cs',
      code: `#nullable enable

using NpgsqlTypes;

namespace Shop.Data;

public enum Mood
{
    [PgName("HAPPY")]
    Happy,
}
`,
    })
    expect(contextFile(plan)).toStrictEqual({
      fileName: 'ShopContext.cs',
      code: `#nullable enable

using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Microsoft.EntityFrameworkCore.ValueGeneration;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Shop.Data;

public partial class ShopContext : DbContext
{
    public ShopContext(DbContextOptions<ShopContext> options)
        : base(options)
    {
    }

    public virtual DbSet<User> Users { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
        npgsql.MapEnum<Mood>("Mood");
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
        dataSource.MapEnum<Mood>("Mood");
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresEnum<Mood>(name: "Mood");

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("User_pkey");

            entity.ToTable("User");

            entity.Property(e => e.Id)
                .HasValueGenerator<UuidV4StringGenerator>()
                .HasColumnName("id");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.Mood)
                .ValueGeneratedNever()
                .HasDefaultValue(Mood.Happy)
                .HasColumnName("mood");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}

file sealed class UuidV4StringGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => Guid.NewGuid().ToString();
}
`,
    })
  })
})

// DMMF a Prisma schema cannot produce: what a hand-built or older DMMF may still hand over.
describe('hand-built DMMF', () => {
  function field(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
    return {
      kind: 'scalar',
      isList: false,
      isRequired: true,
      isUnique: false,
      isId: false,
      isReadOnly: false,
      isGenerated: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
      ...overrides,
    }
  }

  function modelOf(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
    return {
      dbName: null,
      schema: null,
      fields: [],
      uniqueFields: [],
      uniqueIndexes: [],
      primaryKey: null,
      isGenerated: false,
      ...overrides,
    }
  }

  const options = { namespace: 'Models', context: 'AppDbContext' }

  it('reads keys and unique criteria off the models when DMMF has no indexes', () => {
    const models = [
      modelOf({
        name: 'Pair',
        primaryKey: { name: null, fields: ['a', 'b'] },
        uniqueFields: [['c', 'd']],
        fields: [
          field({ name: 'a', type: 'Int' }),
          field({ name: 'b', type: 'Int' }),
          field({ name: 'c', type: 'Int' }),
          field({ name: 'd', type: 'Int' }),
          field({ name: 'e', type: 'String', isUnique: true }),
        ],
      }),
    ]
    const plan = planEfCore({ models, enums: [] }, options)
    expect(contextFile(plan).code).toBe(`#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Pair> Pairs { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Pair>(entity =>
        {
            entity.HasKey(e => new { e.A, e.B }).HasName("Pair_pkey");

            entity.ToTable("Pair");

            entity.HasIndex(e => e.E, "Pair_e_key").IsUnique();

            entity.HasIndex(e => new { e.C, e.D }, "Pair_c_d_key").IsUnique();

            entity.Property(e => e.A).HasColumnName("a");
            entity.Property(e => e.B).HasColumnName("b");
            entity.Property(e => e.C).HasColumnName("c");
            entity.Property(e => e.D).HasColumnName("d");
            entity.Property(e => e.E).HasColumnName("e");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`)
  })

  it('leaves a model with no usable key keyless, and skips a field of an unsupported type', () => {
    const models = [
      modelOf({
        name: 'Log',
        fields: [
          field({ name: 'line', type: 'String' }),
          field({ name: 'code', type: 'String', isUnique: true, isRequired: false }),
          field({ name: 'shape', type: 'geometry', kind: 'unsupported' }),
        ],
      }),
    ]
    const plan = planEfCore({ models, enums: [] }, options)
    expect(entityFile(plan, models[0]).code).toBe(`#nullable enable

namespace Models;

public partial class Log
{
    public string Line { get; set; } = null!;

    public string? Code { get; set; }
}
`)
    expect(contextFile(plan).code).toBe(`#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Log> Logs { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Log>(entity =>
        {
            entity.HasNoKey();

            entity.ToTable("Log");

            entity.HasIndex(e => e.Code, "Log_code_key").IsUnique();

            entity.Property(e => e.Line).HasColumnName("line");
            entity.Property(e => e.Code).HasColumnName("code");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`)
  })

  it('skips a relation to a model it was not given', () => {
    const models = [
      modelOf({
        name: 'Post',
        fields: [
          field({ name: 'id', type: 'Int', isId: true }),
          field({ name: 'authorId', type: 'Int' }),
          field({
            name: 'author',
            type: 'Author',
            kind: 'object',
            relationName: 'AuthorToPost',
            relationFromFields: ['authorId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ]
    const plan = planEfCore({ models, enums: [] }, options)
    expect(plan.foreignKeys).toStrictEqual([])
    expect(entityFile(plan, models[0]).code).toBe(`#nullable enable

namespace Models;

public partial class Post
{
    public int Id { get; set; }

    public int AuthorId { get; set; }

    public virtual Author Author { get; set; } = null!;
}
`)
  })

  it('leaves to the database a default it has no C# spelling for, and escapes strings', () => {
    const enums: DMMF.DatamodelEnum[] = [
      { name: 'Kind', values: [{ name: 'A', dbName: null }], dbName: null },
    ]
    const models = [
      modelOf({
        name: 'Odd',
        fields: [
          field({ name: 'id', type: 'Int', isId: true }),
          field({ name: 'kind', type: 'Kind', kind: 'enum', default: 'GONE' }),
          field({ name: 'oid', type: 'Int', nativeType: ['Oid', []], default: -1 }),
          field({ name: 'amount', type: 'Decimal', default: 'lots' }),
          field({ name: 'far', type: 'DateTime', default: '12020-01-01T00:00:00Z' }),
          field({ name: 'flag', type: 'Boolean', default: 'yes' }),
          field({ name: 'mark', type: 'String', default: 'tab\there\u2028line\u0001end\r\0' }),
          field({
            name: 'blank',
            type: 'Int',
            isRequired: false,
            default: { name: 'dbgenerated', args: [''] },
          }),
          field({ name: 'code', type: 'Int', default: { name: 'uuid', args: [] } }),
        ],
      }),
    ]
    const plan = planEfCore({ models, enums }, options)
    expect(entityFile(plan, models[0]).code).toBe(`#nullable enable

using System;

namespace Models;

public partial class Odd
{
    public int Id { get; set; }

    public Kind Kind { get; set; }

    public uint Oid { get; set; }

    public decimal Amount { get; set; }

    public DateTime Far { get; set; }

    public bool Flag { get; set; }

    public string Mark { get; set; } = "tab\\there\\u2028line\\u0001end\\r\\0";

    public int? Blank { get; set; }

    public int Code { get; set; }
}
`)
    expect(contextFile(plan).code).toBe(`#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Odd> Odds { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
        npgsql.MapEnum<Kind>("Kind");
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
        dataSource.MapEnum<Kind>("Kind");
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresEnum<Kind>(name: "Kind");

        modelBuilder.Entity<Odd>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Odd_pkey");

            entity.ToTable("Odd");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Kind)
                .HasDefaultValueSql("'GONE'")
                .HasColumnName("kind");
            entity.Property(e => e.Oid)
                .HasDefaultValueSql("-1")
                .HasColumnType("oid")
                .HasColumnName("oid");
            entity.Property(e => e.Amount)
                .HasPrecision(65, 30)
                .HasDefaultValueSql("'lots'")
                .HasColumnName("amount");
            entity.Property(e => e.Far)
                .HasDefaultValueSql("'12020-01-01T00:00:00Z'")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("far");
            entity.Property(e => e.Flag)
                .HasDefaultValueSql("'yes'")
                .HasColumnName("flag");
            entity.Property(e => e.Mark)
                .ValueGeneratedNever()
                .HasDefaultValue("tab\\there\\u2028line\\u0001end\\r\\0")
                .HasColumnName("mark");
            entity.Property(e => e.Blank)
                .ValueGeneratedOnAdd()
                .HasColumnName("blank")
                .Metadata.SetValueGenerationStrategy(NpgsqlValueGenerationStrategy.None);
            entity.Property(e => e.Code).HasColumnName("code");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`)
  })

  it('falls back for shapes Prisma rejects, and follows a foreign key to a column no unique criterion covers', () => {
    const models = [
      modelOf({
        name: 'Rest',
        fields: [
          field({ name: 'id', type: 'Int', isId: true }),
          field({ name: 'code', type: 'String' }),
          field({ name: 'geo', type: 'String', nativeType: ['Geometry', []] }),
          field({
            name: 'ids',
            type: 'String',
            isList: true,
            isRequired: false,
            default: { name: 'uuid', args: [] },
          }),
          field({ name: 'seq', type: 'Int', default: { name: 'sequence', args: [] } }),
          field({ name: 'late', type: 'DateTime', default: '9999-12-31T23:00:00-05:00' }),
          field({
            name: 'masks',
            type: 'String',
            isList: true,
            isRequired: false,
            nativeType: ['VarBit', []],
            default: ['101', '11'],
          }),
          field({
            name: 'children',
            type: 'Child',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'ChildToRest',
          }),
        ],
      }),
      modelOf({
        name: 'Child',
        fields: [
          field({ name: 'id', type: 'Int', isId: true }),
          field({ name: 'code', type: 'String' }),
          field({
            name: 'rest',
            type: 'Rest',
            kind: 'object',
            relationName: 'ChildToRest',
            relationFromFields: ['code'],
            relationToFields: ['code'],
          }),
        ],
      }),
    ]
    const plan = planEfCore({ models, enums: [] }, options)
    expect(entityFile(plan, models[0]).code).toBe(`#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;

namespace Models;

public partial class Rest
{
    public int Id { get; set; }

    public string Code { get; set; } = null!;

    public string Geo { get; set; } = null!;

    public List<string>? Ids { get; set; }

    public int Seq { get; set; }

    public DateTime Late { get; set; }

    public List<BitArray>? Masks { get; set; }

    public virtual ICollection<Child> Children { get; set; } = new List<Child>();
}
`)
    expect(contextFile(plan).code).toBe(`#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Rest> Rests { get; set; }

    public virtual DbSet<Child> Children { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Rest>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Rest_pkey");

            entity.ToTable("Rest");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.Geo).HasColumnName("geo");
            entity.Property(e => e.Ids).HasColumnName("ids");
            entity.Property(e => e.Seq).HasColumnName("seq");
            entity.Property(e => e.Late)
                .HasDefaultValueSql("'9999-12-31 23:00:00 -05:00'")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("late");
            entity.Property(e => e.Masks)
                .HasDefaultValueSql("'{\\"101\\",\\"11\\"}'")
                .HasColumnName("masks");
        });

        modelBuilder.Entity<Child>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Child_pkey");

            entity.ToTable("Child");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.Code).HasColumnName("code");

            entity.HasOne(d => d.Rest).WithMany(p => p.Children)
                .HasPrincipalKey(p => p.Code)
                .HasForeignKey(d => d.Code)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("Child_code_fkey");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`)
  })
})
