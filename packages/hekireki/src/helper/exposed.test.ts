import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import {
  entityFile,
  enumEntryName,
  enumFile,
  enumSchemas,
  isKotlinIdentifier,
  joinTableFile,
  kotlinString,
  planExposed,
  propertyName,
  referenceOption,
  relationMaps,
  schemaFile,
  supportFile,
  tableFile,
  typeName,
} from './exposed.js'

const DATASOURCE = 'datasource db {\n  provider = "postgresql"\n}\n\n'

const DEFAULT_OPTIONS = { package: 'models', dao: true }

// The schema is written after a PostgreSQL datasource unless it brings its own; its text goes to
// the plan as the generator hands it over, for what DMMF drops.
function fixture(schema: string, options = DEFAULT_OPTIONS) {
  const source = schema.startsWith('datasource') ? schema : `${DATASOURCE}${schema}`
  const result = getDMMF({ datamodel: [['schema.prisma', source]] })
  if ('type' in result) throw new Error(result.error.message)
  return {
    datamodel: result.datamodel,
    plan: planExposed(result.datamodel, { ...options, source }),
  }
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

describe('isKotlinIdentifier', () => {
  it.each(['models', 'com', 'My_App1', '_x', 'value', 'data', 'field'])('accepts %s', (name) => {
    expect(isKotlinIdentifier(name)).toBe(true)
  })

  it.each([
    '',
    '1a',
    'my-app',
    'my.app',
    'class',
    'fun',
    'in',
    'object',
    'typealias',
    'Café',
    'a b',
  ])('rejects %j', (name) => {
    expect(isKotlinIdentifier(name)).toBe(false)
  })
})

describe('kotlinString', () => {
  it.each([
    ['plain', '"plain"'],
    ['say "hi"', '"say \\"hi\\""'],
    ['C:\\dir', '"C:\\\\dir"'],
    ['$x ${y}', '"\\$x \\${y}"'],
    ['a\nb\r\tc\b', '"a\\nb\\r\\tc\\b"'],
    ['\u0000\u001F\u007F\u0085\u009F\u00A0', '"\\u0000\\u001F\\u007F\\u0085\\u009F\u00A0"'],
    ['\u2028\u2029', '"\\u2028\\u2029"'],
    ['名前 😀', '"名前 😀"'],
  ])('writes %j as %s', (value, literal) => {
    expect(kotlinString(value)).toBe(literal)
  })
})

describe('enumEntryName', () => {
  it.each([
    ['FOO_BAR', 'FOO_BAR'],
    ['ABC123', 'ABC123'],
    ['FooBar', 'FooBar'],
    ['HTTPServer', 'HTTPServer'],
    ['Ünï', 'Ünï'],
    ['low', 'LOW'],
    ['link_only', 'LINK_ONLY'],
    ['fooBar', 'FOO_BAR'],
    ['a1b', 'A1B'],
    ['in', 'IN'],
    ['groß', 'GROSS'],
    ['名前', 'E_名前'],
  ])('names %s %s', (name, entry) => {
    expect(enumEntryName(name)).toBe(entry)
  })
})

describe('typeName', () => {
  it.each([
    ['Member', 'Member'],
    ['AnnouncementToUser', 'AnnouncementToUser'],
    ['friends-of', 'FriendsOf'],
    ['user_profile', 'UserProfile'],
    ['a.b', 'AB'],
    ['x__y', 'XY'],
    ['ünter', 'Ünter'],
    ['名前', '名前'],
  ])('names %s %s', (name, type) => {
    expect(typeName(name)).toBe(type)
  })
})

describe('propertyName', () => {
  it.each([
    ['id', 'id'],
    ['userId', 'userId'],
    ['iOS', 'iOS'],
    ['über', 'über'],
    ['名前', '名前'],
    ['sku_code', 'skuCode'],
    ['UserId', 'userId'],
    ['URL', 'url'],
    ['ID', 'id'],
    ['XMLHttp', 'xmlHttp'],
    ['ÜBER', 'über'],
    ['über_all', 'überAll'],
  ])('names %s %s', (name, property) => {
    expect(propertyName(name)).toBe(property)
  })
})

describe('referenceOption', () => {
  it.each([
    ['Cascade', 'Restrict', 'CASCADE'],
    ['Restrict', 'SetNull', 'RESTRICT'],
    ['NoAction', 'Restrict', 'NO_ACTION'],
    ['SetNull', 'Restrict', 'SET_NULL'],
    ['SetDefault', 'Restrict', 'SET_DEFAULT'],
    [undefined, 'Restrict', 'RESTRICT'],
    [undefined, 'SetNull', 'SET_NULL'],
    [undefined, 'Cascade', 'CASCADE'],
    ['Unknown', 'Cascade', 'CASCADE'],
    ['Unknown', 'Unknown', 'NO_ACTION'],
  ] as const)('takes onDelete/onUpdate %s, defaulting to %s, as %s', (action, fallback, option) => {
    expect(referenceOption(action, fallback)).toBe(option)
  })
})

describe('enumSchemas', () => {
  it('reads the @@schema of each enum block, whichever way it is written', () => {
    expect(
      enumSchemas(`datasource db {
  provider = "postgresql"
  schemas  = ["public", "audit", "sales", "a\\"b\\\\cA"]
}

// enum Commented {
//   @@schema("commented")
// }

enum Level {
  LOW  // @@schema("comment")
  HIGH @map("}")

  @@schema("audit")
}

enum Plain {
  A
}

model Account {
  id Int @id

  @@schema("public")
}

enum Named {
  B

  @@schema(map: "sales")
}

enum Escaped {
  C

  @@schema( "a\\"b\\\\c\\u0041" )
}

enum Größe {
  KLEIN

  @@schema("public")
}
`),
    ).toStrictEqual(
      new Map([
        ['Level', 'audit'],
        ['Named', 'sales'],
        ['Escaped', 'a"b\\cA'],
        ['Größe', 'public'],
      ]),
    )
  })

  it('reads a schema written with CRLF line endings', () => {
    expect(enumSchemas('enum Level {\r\n  LOW\r\n\r\n  @@schema("audit")\r\n}\r\n')).toStrictEqual(
      new Map([['Level', 'audit']]),
    )
  })
})

describe('relationMaps', () => {
  it('reads the map of each relation by model and field, skipping comments and strings', () => {
    expect(
      relationMaps(`model Post {
  id         Int    @id
  authorId   Int
  editorId   Int
  reviewerId Int
  größeId    Int
  author     User   @relation("written", fields: [authorId], references: [id], map: "post_author")
  editor     User   @relation(name: "edited", fields: [editorId], references: [id]) // map: "comment"
  note       String @default("@relation(map: \\"not_this\\")")
  reviewer   User   @relation("reviewed", map:"a\\"quote\\u0021", fields: [reviewerId], references: [id])
  größe      User   @relation("sized", fields: [größeId], references: [id], map: "post_größe")
  // author2 User @relation(fields: [authorId], references: [id], map: "commented")
}

enum Kind {
  author
}

model User {
  id       Int    @id
  written  Post[] @relation("written")
  edited   Post[] @relation("edited")
  reviewed Post[] @relation("reviewed")
  sized    Post[] @relation("sized")
}
`),
    ).toStrictEqual(
      new Map([
        ['Post.author', 'post_author'],
        ['Post.reviewer', 'a"quote!'],
        ['Post.größe', 'post_größe'],
      ]),
    )
  })

  it('reads a schema written with CRLF line endings', () => {
    expect(
      relationMaps(
        'model Post {\r\n  author User @relation(fields: [authorId], references: [id], map: "fk")\r\n}\r\n',
      ),
    ).toStrictEqual(new Map([['Post.author', 'fk']]))
  })
})

describe('tableFile and entityFile', () => {
  it('writes an IdTable object and an Entity class for a model with an autoincrement key', () => {
    const { datamodel, plan } = fixture(`enum Role {
  ADMIN
  MEMBER
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
  role  Role   @default(MEMBER)
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  title    String
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`)
    expect(tableFile(plan, model(datamodel, 'User'))).toStrictEqual({
      fileName: 'UserTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object UserTable : IdTable<Int>("\\"User\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val email = text("email").uniqueIndex("\\"User_email_key\\"")
    val name = text("name").nullable()
    val role = pgEnum("role", "\\"Role\\"", Role.entries, Role::dbName).default(Role.MEMBER)
    override val primaryKey = PrimaryKey(id, name = "\\"User_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'User'))).toStrictEqual({
      fileName: 'UserEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class UserEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, UserEntity>(UserTable)

    var email by UserTable.email
    var name by UserTable.name
    var role by UserTable.role
    val posts by PostEntity referrersOn PostTable.authorId
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object PostTable : IdTable<Int>("\\"Post\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val title = text("title")
    val authorId =
        reference(
            "authorId",
            UserTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Post_authorId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Post_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PostEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, PostEntity>(PostTable)

    var title by PostTable.title
    var authorId by PostTable.authorId
    var author by UserEntity referencedOn PostTable.authorId
}
`,
    })
  })

  it('maps every Prisma scalar type, required and optional', () => {
    const { datamodel, plan } = fixture(`model Scalar {
  id        String   @id
  text      String
  int       Int
  bigInt    BigInt
  float     Float
  decimal   Decimal
  boolean   Boolean
  dateTime  DateTime
  json      Json
  bytes     Bytes
  textOpt   String?
  intOpt    Int?
  bigOpt    BigInt?
  floatOpt  Float?
  decOpt    Decimal?
  boolOpt   Boolean?
  dateOpt   DateTime?
  jsonOpt   Json?
  bytesOpt  Bytes?
}
`)
    expect(tableFile(plan, model(datamodel, 'Scalar'))).toStrictEqual({
      fileName: 'ScalarTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.json.jsonb

object ScalarTable : IdTable<String>("\\"Scalar\\"") {
    override val id = text("id").entityId()
    val text = text("text")
    val int = integer("int")
    val bigInt = long("bigInt")
    val float = double("float")
    val decimal = decimal("decimal", 65, 30)
    val boolean = bool("boolean")
    val dateTime = pgTimestamp("dateTime", 3)
    val json = jsonb<String>("json", { it }, { it })
    val bytes = binary("bytes")
    val textOpt = text("textOpt").nullable()
    val intOpt = integer("intOpt").nullable()
    val bigOpt = long("bigOpt").nullable()
    val floatOpt = double("floatOpt").nullable()
    val decOpt = decimal("decOpt", 65, 30).nullable()
    val boolOpt = bool("boolOpt").nullable()
    val dateOpt = pgTimestamp("dateOpt", 3).nullable()
    val jsonOpt = jsonb<String>("jsonOpt", { it }, { it }).nullable()
    val bytesOpt = binary("bytesOpt").nullable()
    override val primaryKey = PrimaryKey(id, name = "\\"Scalar_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Scalar'))).toStrictEqual({
      fileName: 'ScalarEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class ScalarEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, ScalarEntity>(ScalarTable)

    var text by ScalarTable.text
    var int by ScalarTable.int
    var bigInt by ScalarTable.bigInt
    var float by ScalarTable.float
    var decimal by ScalarTable.decimal
    var boolean by ScalarTable.boolean
    var dateTime by ScalarTable.dateTime
    var json by ScalarTable.json
    var bytes by ScalarTable.bytes
    var textOpt by ScalarTable.textOpt
    var intOpt by ScalarTable.intOpt
    var bigOpt by ScalarTable.bigOpt
    var floatOpt by ScalarTable.floatOpt
    var decOpt by ScalarTable.decOpt
    var boolOpt by ScalarTable.boolOpt
    var dateOpt by ScalarTable.dateOpt
    var jsonOpt by ScalarTable.jsonOpt
    var bytesOpt by ScalarTable.bytesOpt
}
`,
    })
  })

  it('maps every PostgreSQL native type', () => {
    const { datamodel, plan } = fixture(`model Native {
  id          Int      @id @db.Integer
  text        String   @db.Text
  varchar     String   @db.VarChar(20)
  varcharAny  String   @db.VarChar
  char        String   @db.Char(3)
  charOne     String   @db.Char
  citext      String   @db.Citext
  xml         String   @db.Xml
  inet        String   @db.Inet
  bit         String   @db.Bit(4)
  bitOne      String   @db.Bit
  varbit      String   @db.VarBit(8)
  varbitAny   String   @db.VarBit
  uuid        String   @db.Uuid
  small       Int      @db.SmallInt
  oid         Int      @db.Oid
  big         BigInt   @db.BigInt
  real        Float    @db.Real
  double      Float    @db.DoublePrecision
  money       Decimal  @db.Money
  decimal     Decimal  @db.Decimal(10, 2)
  numeric     Decimal  @db.Decimal
  timestamp   DateTime @db.Timestamp(6)
  timestamp0  DateTime @db.Timestamp(0)
  timestamptz DateTime @db.Timestamptz(3)
  date        DateTime @db.Date
  time        DateTime @db.Time(3)
  timetz      DateTime @db.Timetz
  json        Json     @db.Json
  jsonb       Json     @db.JsonB
  bytea       Bytes    @db.ByteA
}
`)
    expect(tableFile(plan, model(datamodel, 'Native'))).toStrictEqual({
      fileName: 'NativeTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.json.json
import org.jetbrains.exposed.v1.json.jsonb

object NativeTable : IdTable<Int>("\\"Native\\"") {
    override val id = integer("id").entityId()
    val text = text("text")
    val varchar = varchar("varchar", 20)
    val varcharAny = pgVarchar("varcharAny")
    val char = char("char", 3)
    val charOne = char("charOne", 1)
    val citext = pgCitext("citext")
    val xml = pgXml("xml")
    val inet = pgInet("inet")
    val bit = pgBit("bit", 4)
    val bitOne = pgBit("bitOne", 1)
    val varbit = pgVarbit("varbit", 8)
    val varbitAny = pgVarbit("varbitAny")
    val uuid = javaUUID("uuid")
    val small = short("small")
    val oid = pgOid("oid")
    val big = long("big")
    val real = float("real")
    val double = double("double")
    val money = pgMoney("money")
    val decimal = decimal("decimal", 10, 2)
    val numeric = pgNumeric("numeric")
    val timestamp = pgTimestamp("timestamp", 6)
    val timestamp0 = pgTimestamp("timestamp0", 0)
    val timestamptz = pgTimestamptz("timestamptz", 3)
    val date = pgDate("date")
    val time = pgTime("time", 3)
    val timetz = pgTimetz("timetz")
    val json = json<String>("json", { it }, { it })
    val jsonb = jsonb<String>("jsonb", { it }, { it })
    val bytea = binary("bytea")
    override val primaryKey = PrimaryKey(id, name = "\\"Native_pkey\\"")
}
`,
    })
  })

  it('maps lists, reading temporal, money, JSON and text-cast elements one by one', () => {
    const { datamodel, plan } = fixture(`enum Tone {
  WARM
  COOL
}

model Listing {
  id         Int        @id
  texts      String[]
  ints       Int[]
  bigs       BigInt[]
  floats     Float[]
  decimals   Decimal[]
  booleans   Boolean[]
  stamps     DateTime[]
  jsons      Json[]
  blobs      Bytes[]
  tones      Tone[]
  uuids      String[]   @db.Uuid
  smalls     Int[]      @db.SmallInt
  zoned      DateTime[] @db.Timestamptz(6)
  days       DateTime[] @db.Date
  times      DateTime[] @db.Time(3)
  zonedTimes DateTime[] @db.Timetz(3)
  moneys     Decimal[]  @db.Money
  bits       String[]   @db.Bit(1)
  inets      String[]   @db.Inet
  numerics   Decimal[]  @db.Decimal
  jsonbs     Json[]     @db.JsonB
  codes      String[]   @db.Char(3)
  stampsAny  DateTime[] @db.Timestamp
  timesAny   DateTime[] @db.Time
  zonedAny   DateTime[] @db.Timetz
  optional   String[]
}
`)
    expect(tableFile(plan, model(datamodel, 'Listing'))).toStrictEqual({
      fileName: 'ListingTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.BasicBinaryColumnType
import org.jetbrains.exposed.v1.core.BooleanColumnType
import org.jetbrains.exposed.v1.core.DecimalColumnType
import org.jetbrains.exposed.v1.core.DoubleColumnType
import org.jetbrains.exposed.v1.core.IntegerColumnType
import org.jetbrains.exposed.v1.core.LongColumnType
import org.jetbrains.exposed.v1.core.ShortColumnType
import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.core.java.UUIDColumnType
import org.jetbrains.exposed.v1.json.JsonBColumnType
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.OffsetTime

object ListingTable : IdTable<Int>("\\"Listing\\"") {
    override val id = integer("id").entityId()
    val texts = array("texts", TextColumnType()).nullable()
    val ints = array("ints", IntegerColumnType()).nullable()
    val bigs = array("bigs", LongColumnType()).nullable()
    val floats = array("floats", DoubleColumnType()).nullable()
    val decimals = array("decimals", DecimalColumnType(65, 30)).nullable()
    val booleans = array("booleans", BooleanColumnType()).nullable()
    val stamps = pgList("stamps", PgTimestampColumnType(3), LocalDateTime::class.java).nullable()
    val jsons = pgList("jsons", JsonBColumnType<String>({ it }, { it }), String::class.java).nullable()
    val blobs = array("blobs", BasicBinaryColumnType()).nullable()
    val tones = array("tones", PgEnumColumnType("\\"Tone\\"", Tone.entries, Tone::dbName)).nullable()
    val uuids = array("uuids", UUIDColumnType()).nullable()
    val smalls = array("smalls", ShortColumnType()).nullable()
    val zoned = pgList("zoned", PgTimestamptzColumnType(6), OffsetDateTime::class.java).nullable()
    val days = pgList("days", PgDateColumnType(), LocalDate::class.java).nullable()
    val times = pgList("times", PgTimeColumnType(3), LocalTime::class.java).nullable()
    val zonedTimes = pgList("zonedTimes", PgTimetzColumnType(3), OffsetTime::class.java).nullable()
    val moneys = pgList("moneys", PgMoneyColumnType(), String::class.java).nullable()
    val bits = pgList("bits", PgStringColumnType("BIT(1)", "varbit"), String::class.java).nullable()
    val inets = pgList("inets", PgStringColumnType("INET", "inet"), String::class.java).nullable()
    val numerics = array("numerics", PgNumericColumnType()).nullable()
    val jsonbs = pgList("jsonbs", JsonBColumnType<String>({ it }, { it }), String::class.java).nullable()
    val codes = array("codes", PgStringColumnType("BPCHAR(3)", "bpchar")).nullable()
    val stampsAny = pgList("stampsAny", PgTimestampColumnType(), LocalDateTime::class.java).nullable()
    val timesAny = pgList("timesAny", PgTimeColumnType(), LocalTime::class.java).nullable()
    val zonedAny = pgList("zonedAny", PgTimetzColumnType(), OffsetTime::class.java).nullable()
    val optional = array("optional", TextColumnType()).nullable()
    override val primaryKey = PrimaryKey(id, name = "\\"Listing_pkey\\"")
}
`,
    })
  })

  it('writes each kind of default the way Prisma applies it', () => {
    const { datamodel, plan } = fixture(`enum Mood {
  HAPPY
  SAD  @map("sad")
}

model Defaults {
  id         String    @id @default(uuid())
  uuid7      String    @default(uuid(7)) @db.Uuid
  cuid       String    @default(cuid())
  cuid2      String    @default(cuid(2))
  ulid       String    @default(ulid())
  nanoid     String    @default(nanoid())
  nanoid8    String    @default(nanoid(8))
  generated  String    @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  big        BigInt    @default(autoincrement())
  text       String    @default("it's")
  lines      String    @default("a\\r\\nb")
  dollar     String    @default("$x")
  int        Int       @default(-1)
  bigInt     BigInt    @default(9007199254740993)
  float      Float     @default(1.5)
  real       Float     @default(0.25) @db.Real
  decimal    Decimal   @default(12.30)
  money      Decimal   @default(1.5) @db.Money
  boolean    Boolean   @default(true)
  mood       Mood      @default(SAD)
  json       Json      @default("{\\"a\\": 1}")
  bytes      Bytes     @default("aGk=")
  stamp      DateTime  @default("2024-01-02T03:04:05.678Z")
  offset     DateTime  @default("2024-01-02T03:04:05+09:00")
  zoned      DateTime  @default("2024-01-02T03:04:05Z") @db.Timestamptz(3)
  day        DateTime  @default("2024-01-02T00:00:00Z") @db.Date
  clock      DateTime  @default("1970-01-01T12:34:56.789Z") @db.Time(3)
  now        DateTime  @default(now())
  dayNow     DateTime  @default(now()) @db.Date
  timeNow    DateTime  @default(now()) @db.Time(3)
  zonedNow   DateTime  @default(now()) @db.Timetz(3)
  tags       String[]  @default(["a", "b"])
  moods      Mood[]    @default([HAPPY, SAD])
  empty      Int[]     @default([])
  touched    DateTime  @updatedAt
  touchedDay DateTime? @updatedAt @db.Date
}
`)
    expect(tableFile(plan, model(datamodel, 'Defaults'))).toStrictEqual({
      fileName: 'DefaultsTable.kt',
      code: `package models

import com.github.f4b6a3.ulid.UlidCreator
import io.github.thibaultmeyer.cuid.CUID
import org.jetbrains.exposed.v1.core.IntegerColumnType
import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.json.jsonb
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

object DefaultsTable : IdTable<String>("\\"Defaults\\"") {
    override val id = text("id").clientDefault { UUID.randomUUID().toString() }.entityId()
    val uuid7 = javaUUID("uuid7").clientDefault { uuidV7() }
    val cuid = text("cuid").clientDefault { CUID.randomCUID1().toString() }
    val cuid2 = text("cuid2").clientDefault { CUID.randomCUID2().toString() }
    val ulid = text("ulid").clientDefault { UlidCreator.getUlid().toString() }
    val nanoid = text("nanoid").clientDefault { nanoid(21) }
    val nanoid8 = text("nanoid8").clientDefault { nanoid(8) }
    val generated = javaUUID("generated").databaseDefault("gen_random_uuid()")
    val big = long("big").autoIncrement()
    val text = text("text").default("it's")
    val lines = text("lines").databaseDefault("'a\\r\\nb'") { "a\\r\\nb" }
    val dollar = text("dollar").default("\\$x")
    val int = integer("int").default(-1)
    val bigInt = long("bigInt").default(9007199254740993L)
    val float = double("float").default(1.5)
    val real = float("real").default(0.25f)
    val decimal = decimal("decimal", 65, 30).default(BigDecimal("12.30"))
    val money = pgMoney("money").default(BigDecimal("1.5"))
    val boolean = bool("boolean").default(true)
    val mood = pgEnum("mood", "\\"Mood\\"", Mood.entries, Mood::dbName).default(Mood.SAD)
    val json = jsonb<String>("json", { it }, { it }).default("{\\"a\\": 1}")
    val bytes = binary("bytes").default(Base64.getDecoder().decode("aGk="))
    val stamp = pgTimestamp("stamp", 3).default(Instant.parse("2024-01-02T03:04:05.678Z"))
    val offset = pgTimestamp("offset", 3).databaseDefault("'2024-01-02 03:04:05 +09:00'") { Instant.parse("2024-01-01T18:04:05Z") }
    val zoned = pgTimestamptz("zoned", 3).default(Instant.parse("2024-01-02T03:04:05Z"))
    val day = pgDate("day").default(LocalDate.parse("2024-01-02"))
    val clock = pgTime("clock", 3).default(LocalTime.parse("12:34:56.789"))
    val now = pgTimestamp("now", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    val dayNow = pgDate("dayNow").databaseDefault("CURRENT_TIMESTAMP") { LocalDate.now(ZoneOffset.UTC) }
    val timeNow = pgTime("timeNow", 3).databaseDefault("CURRENT_TIMESTAMP") { LocalTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS) }
    val zonedNow =
        pgTimetz("zonedNow", 3).databaseDefault("CURRENT_TIMESTAMP") { OffsetTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS) }
    val tags = array("tags", TextColumnType()).nullable().databaseDefault("'{\\"a\\",\\"b\\"}'") { listOf("a", "b") }
    val moods =
        array("moods", PgEnumColumnType("\\"Mood\\"", Mood.entries, Mood::dbName))
            .nullable()
            .databaseDefault("'{\\"HAPPY\\",\\"sad\\"}'") { listOf(Mood.HAPPY, Mood.SAD) }
    val empty = array("empty", IntegerColumnType()).nullable().databaseDefault("'{}'") { emptyList() }
    val touched = pgTimestamp("touched", 3).clientDefault { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    val touchedDay = pgDate("touchedDay").nullable().clientDefault { LocalDate.now(ZoneOffset.UTC) }
    override val primaryKey = PrimaryKey(id, name = "\\"Defaults_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Defaults'))).toStrictEqual({
      fileName: 'DefaultsEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityBatchUpdate
import org.jetbrains.exposed.v1.dao.EntityClass
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

class DefaultsEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, DefaultsEntity>(DefaultsTable)

    var uuid7 by DefaultsTable.uuid7
    var cuid by DefaultsTable.cuid
    var cuid2 by DefaultsTable.cuid2
    var ulid by DefaultsTable.ulid
    var nanoid by DefaultsTable.nanoid
    var nanoid8 by DefaultsTable.nanoid8
    var generated by DefaultsTable.generated
    var big by DefaultsTable.big
    var text by DefaultsTable.text
    var lines by DefaultsTable.lines
    var dollar by DefaultsTable.dollar
    var int by DefaultsTable.int
    var bigInt by DefaultsTable.bigInt
    var float by DefaultsTable.float
    var real by DefaultsTable.real
    var decimal by DefaultsTable.decimal
    var money by DefaultsTable.money
    var boolean by DefaultsTable.boolean
    var mood by DefaultsTable.mood
    var json by DefaultsTable.json
    var bytes by DefaultsTable.bytes
    var stamp by DefaultsTable.stamp
    var offset by DefaultsTable.offset
    var zoned by DefaultsTable.zoned
    var day by DefaultsTable.day
    var clock by DefaultsTable.clock
    var now by DefaultsTable.now
    var dayNow by DefaultsTable.dayNow
    var timeNow by DefaultsTable.timeNow
    var zonedNow by DefaultsTable.zonedNow
    var tags by DefaultsTable.tags
    var moods by DefaultsTable.moods
    var empty by DefaultsTable.empty
    var touched by DefaultsTable.touched
    var touchedDay by DefaultsTable.touchedDay

    override fun flush(batch: EntityBatchUpdate?): Boolean {
        if (writeValues.isNotEmpty()) {
            if (!isWritten(DefaultsTable.touched)) {
                touched = Instant.now().truncatedTo(ChronoUnit.MILLIS)
            }
            if (!isWritten(DefaultsTable.touchedDay)) {
                touchedDay = LocalDate.now(ZoneOffset.UTC)
            }
        }
        return super.flush(batch)
    }
}
`,
    })
  })

  it('keys a model by its composite primary key', () => {
    const { datamodel, plan } = fixture(`model Ledger {
  book  String
  seq   Int    @default(autoincrement())
  memo  String
  lines Line[]

  @@id([book, seq], map: "ledger_pk")
}

model Line {
  id     Int    @id @default(autoincrement())
  book   String
  seq    Int
  ledger Ledger @relation(fields: [book, seq], references: [book, seq], onDelete: Cascade)
}
`)
    expect(tableFile(plan, model(datamodel, 'Ledger'))).toStrictEqual({
      fileName: 'LedgerTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeIdTable

object LedgerTable : CompositeIdTable("\\"Ledger\\"") {
    val book = text("book").entityId()
    val seq = integer("seq").autoIncrement().entityId()
    val memo = text("memo")
    override val primaryKey = PrimaryKey(book, seq, name = "ledger_pk")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Ledger'))).toStrictEqual({
      fileName: 'LedgerEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.CompositeEntity
import org.jetbrains.exposed.v1.dao.CompositeEntityClass

class LedgerEntity(
    id: EntityID<CompositeID>,
) : CompositeEntity(id) {
    companion object : CompositeEntityClass<LedgerEntity>(LedgerTable)

    val book by LedgerTable.book
    val seq by LedgerTable.seq
    var memo by LedgerTable.memo
    val lines by LineEntity referrersOn LineTable
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Line'))).toStrictEqual({
      fileName: 'LineTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object LineTable : IdTable<Int>("\\"Line\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val book = text("book")
    val seq = integer("seq")
    override val primaryKey = PrimaryKey(id, name = "\\"Line_pkey\\"")

    init {
        foreignKey(
            book to LedgerTable.book,
            seq to LedgerTable.seq,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Line_book_seq_fkey\\"",
        )
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Line'))).toStrictEqual({
      fileName: 'LineEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class LineEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, LineEntity>(LineTable)

    var book by LineTable.book
    var seq by LineTable.seq
    var ledger by LedgerEntity referencedOn LineTable
}
`,
    })
  })

  it('keys a model without @id by its unique criterion', () => {
    const { datamodel, plan } = fixture(`model Keyed {
  region String
  code   String
  note   String?

  @@unique([region, code])
}

model Single {
  slug String @unique
  note String?
}
`)
    expect(tableFile(plan, model(datamodel, 'Keyed'))).toStrictEqual({
      fileName: 'KeyedTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeIdTable

object KeyedTable : CompositeIdTable("\\"Keyed\\"") {
    val region = text("region").entityId()
    val code = text("code").entityId()
    val note = text("note").nullable()

    init {
        uniqueIndex("\\"Keyed_region_code_key\\"", region, code)
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Keyed'))).toStrictEqual({
      fileName: 'KeyedEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.CompositeEntity
import org.jetbrains.exposed.v1.dao.CompositeEntityClass

class KeyedEntity(
    id: EntityID<CompositeID>,
) : CompositeEntity(id) {
    companion object : CompositeEntityClass<KeyedEntity>(KeyedTable)

    val region by KeyedTable.region
    val code by KeyedTable.code
    var note by KeyedTable.note
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Single'))).toStrictEqual({
      fileName: 'SingleTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object SingleTable : IdTable<String>("\\"Single\\"") {
    override val id = text("slug").entityId()
    val note = text("note").nullable()

    init {
        uniqueIndex("\\"Single_slug_key\\"", id)
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Single'))).toStrictEqual({
      fileName: 'SingleEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class SingleEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, SingleEntity>(SingleTable)

    var note by SingleTable.note
}
`,
    })
  })

  it('writes referential actions, constraint names and the foreign keys a DAO can follow', () => {
    const { datamodel, plan } = fixture(`model Member {
  id      Int      @id @default(autoincrement())
  handle  String   @unique
  badges  Badge[]
  posts   Post[]
  profile Profile?
  parent  Member?  @relation("Tree", fields: [parentId], references: [id], onDelete: SetNull)
  parentId Int?
  children Member[] @relation("Tree")
}

model Post {
  id       Int     @id @default(autoincrement())
  authorId Int?
  author   Member? @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: Restrict, map: "post_author")
}

model Badge {
  id           Int    @id @default(autoincrement())
  memberHandle String
  member       Member @relation(fields: [memberHandle], references: [handle], onDelete: NoAction)
}

model Profile {
  id       Int    @id @default(autoincrement())
  memberId Int    @unique
  member   Member @relation(fields: [memberId], references: [id])
}
`)
    expect(tableFile(plan, model(datamodel, 'Member'))).toStrictEqual({
      fileName: 'MemberTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object MemberTable : IdTable<Int>("\\"Member\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val handle = text("handle").uniqueIndex("\\"Member_handle_key\\"")
    val parentId =
        optReference(
            "parentId",
            MemberTable,
            onDelete = ReferenceOption.SET_NULL,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Member_parentId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Member_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Member'))).toStrictEqual({
      fileName: 'MemberEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class MemberEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, MemberEntity>(MemberTable)

    var handle by MemberTable.handle
    val badges by BadgeEntity referrersOn BadgeTable.memberHandle
    val posts by PostEntity optionalReferrersOn PostTable.authorId
    val profile by ProfileEntity optionalBackReferencedOn ProfileTable.memberId
    var parent by MemberEntity optionalReferencedOn MemberTable.parentId
    var parentId by MemberTable.parentId
    val children by MemberEntity optionalReferrersOn MemberTable.parentId
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object PostTable : IdTable<Int>("\\"Post\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val authorId =
        optReference(
            "authorId",
            MemberTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.RESTRICT,
            fkName = "post_author",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Post_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PostEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, PostEntity>(PostTable)

    var authorId by PostTable.authorId
    var author by MemberEntity optionalReferencedOn PostTable.authorId
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Badge'))).toStrictEqual({
      fileName: 'BadgeTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object BadgeTable : IdTable<Int>("\\"Badge\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val memberHandle =
        text("memberHandle").references(
            MemberTable.handle,
            onDelete = ReferenceOption.NO_ACTION,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Badge_memberHandle_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Badge_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Badge'))).toStrictEqual({
      fileName: 'BadgeEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class BadgeEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, BadgeEntity>(BadgeTable)

    var memberHandle by BadgeTable.memberHandle
    var member by MemberEntity referencedOn BadgeTable.memberHandle
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Profile'))).toStrictEqual({
      fileName: 'ProfileTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object ProfileTable : IdTable<Int>("\\"Profile\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val memberId =
        reference(
            "memberId",
            MemberTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Profile_memberId_fkey\\"",
        ).uniqueIndex("\\"Profile_memberId_key\\"")
    override val primaryKey = PrimaryKey(id, name = "\\"Profile_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Profile'))).toStrictEqual({
      fileName: 'ProfileEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class ProfileEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, ProfileEntity>(ProfileTable)

    var memberId by ProfileTable.memberId
    var member by MemberEntity referencedOn ProfileTable.memberId
}
`,
    })
  })

  it('names two relations to the same model apart', () => {
    const { datamodel, plan } = fixture(`model Person {
  id       Int       @id @default(autoincrement())
  sent     Message[] @relation("sent")
  received Message[] @relation("received")
}

model Message {
  id          Int    @id @default(autoincrement())
  senderId    Int
  recipientId Int
  sender      Person @relation("sent", fields: [senderId], references: [id])
  recipient   Person @relation("received", fields: [recipientId], references: [id])
}
`)
    expect(entityFile(plan, model(datamodel, 'Person'))).toStrictEqual({
      fileName: 'PersonEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PersonEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, PersonEntity>(PersonTable)

    val sent by MessageEntity referrersOn MessageTable.senderId
    val received by MessageEntity referrersOn MessageTable.recipientId
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Message'))).toStrictEqual({
      fileName: 'MessageTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object MessageTable : IdTable<Int>("\\"Message\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val senderId =
        reference(
            "senderId",
            PersonTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Message_senderId_fkey\\"",
        )
    val recipientId =
        reference(
            "recipientId",
            PersonTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Message_recipientId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Message_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Message'))).toStrictEqual({
      fileName: 'MessageEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class MessageEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, MessageEntity>(MessageTable)

    var senderId by MessageTable.senderId
    var recipientId by MessageTable.recipientId
    var sender by PersonEntity referencedOn MessageTable.senderId
    var recipient by PersonEntity referencedOn MessageTable.recipientId
}
`,
    })
  })

  it('declares a referenced column first when foreign keys form a cycle', () => {
    const { datamodel, plan } = fixture(`model Hen {
  id    Int  @id @default(autoincrement())
  eggId Int? @unique
  egg   Egg? @relation("HenEgg", fields: [eggId], references: [id])
  laid  Egg[] @relation("Laid")
}

model Egg {
  id    Int  @id @default(autoincrement())
  henId Int?
  hen   Hen? @relation("Laid", fields: [henId], references: [id])
  in    Hen? @relation("HenEgg")
}
`)
    expect(tableFile(plan, model(datamodel, 'Hen'))).toStrictEqual({
      fileName: 'HenTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object HenTable : IdTable<Int>("\\"Hen\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val eggId =
        optReference(
            "eggId",
            EggTable,
            onDelete = ReferenceOption.SET_NULL,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Hen_eggId_fkey\\"",
        ).uniqueIndex("\\"Hen_eggId_key\\"")
    override val primaryKey = PrimaryKey(id, name = "\\"Hen_pkey\\"")
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Egg'))).toStrictEqual({
      fileName: 'EggTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object EggTable : IdTable<Int>("\\"Egg\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val henId =
        optReference(
            "henId",
            HenTable,
            onDelete = ReferenceOption.SET_NULL,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Egg_henId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Egg_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Egg'))).toStrictEqual({
      fileName: 'EggEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class EggEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, EggEntity>(EggTable)

    var henId by EggTable.henId
    var hen by HenEntity optionalReferencedOn EggTable.henId
    val \`in\` by HenEntity optionalBackReferencedOn HenTable.eggId
}
`,
    })
  })

  it('shares a key with the model it belongs to', () => {
    const { datamodel, plan } = fixture(`model Wallet {
  id    String       @id @default(dbgenerated("gen_random_uuid()::text"))
  owner WalletOwner?
}

model WalletOwner {
  walletId String @id
  name     String
  wallet   Wallet @relation(fields: [walletId], references: [id])
}
`)
    expect(tableFile(plan, model(datamodel, 'Wallet'))).toStrictEqual({
      fileName: 'WalletTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object WalletTable : IdTable<String>("\\"Wallet\\"") {
    override val id = text("id").databaseDefault("gen_random_uuid()::text").entityId()
    override val primaryKey = PrimaryKey(id, name = "\\"Wallet_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Wallet'))).toStrictEqual({
      fileName: 'WalletEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class WalletEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, WalletEntity>(WalletTable)

    val owner by WalletOwnerEntity optionalBackReferencedOn WalletOwnerTable.id
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'WalletOwner'))).toStrictEqual({
      fileName: 'WalletOwnerTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object WalletOwnerTable : IdTable<String>("\\"WalletOwner\\"") {
    override val id =
        text("walletId")
            .references(
                WalletTable.id,
                onDelete = ReferenceOption.RESTRICT,
                onUpdate = ReferenceOption.CASCADE,
                fkName = "\\"WalletOwner_walletId_fkey\\"",
            ).entityId()
    val name = text("name")
    override val primaryKey = PrimaryKey(id, name = "\\"WalletOwner_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'WalletOwner'))).toStrictEqual({
      fileName: 'WalletOwnerEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class WalletOwnerEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, WalletOwnerEntity>(WalletOwnerTable)

    var name by WalletOwnerTable.name
    val wallet by WalletEntity referencedOn WalletOwnerTable.id
}
`,
    })
  })

  it('keys a table by foreign keys, and follows by column alone or not at all what the DAO cannot', () => {
    const { datamodel, plan } = fixture(`model Account {
  id        Int      @id @default(autoincrement())
  followers Follow[] @relation("follower")
  following Follow[] @relation("following")
  owned     Shared[] @relation("owner")
  aliased   Shared[] @relation("alias")
}

model Follow {
  followerId  Int
  followingId Int
  follower    Account @relation("follower", fields: [followerId], references: [id])
  following   Account @relation("following", fields: [followingId], references: [id])

  @@id([followerId, followingId])
}

model Shared {
  id      Int     @id @default(autoincrement())
  ownerId Int
  owner   Account @relation("owner", fields: [ownerId], references: [id], map: "shared_owner_fkey")
  alias   Account @relation("alias", fields: [ownerId], references: [id], map: "Shared_alias_FK")
}

model Tiny {
  id   Int       @id @default(autoincrement()) @db.SmallInt
  refs TinyRef[]
}

model TinyRef {
  id     Int  @id @default(autoincrement())
  tinyId Int  @db.SmallInt
  tiny   Tiny @relation(fields: [tinyId], references: [id])
}

model Ledger {
  book   String
  seq    Int
  lines  Line[] @relation("ledger")
  others Line[] @relation("other")

  @@id([book, seq])
}

model Line {
  id        Int    @id @default(autoincrement())
  book      String
  seq       Int
  otherBook String
  otherSeq  Int
  ledger    Ledger @relation("ledger", fields: [book, seq], references: [book, seq])
  other     Ledger @relation("other", fields: [otherBook, otherSeq], references: [book, seq])
}
`)
    expect(tableFile(plan, model(datamodel, 'Follow'))).toStrictEqual({
      fileName: 'FollowTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.CompositeIdTable

object FollowTable : CompositeIdTable("\\"Follow\\"") {
    val followerId =
        reference(
            "followerId",
            AccountTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Follow_followerId_fkey\\"",
        )
    val followingId =
        reference(
            "followingId",
            AccountTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Follow_followingId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(followerId, followingId, name = "\\"Follow_pkey\\"")

    init {
        addIdColumn(followerId)
        addIdColumn(followingId)
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Follow'))).toStrictEqual({
      fileName: 'FollowEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.CompositeEntity
import org.jetbrains.exposed.v1.dao.CompositeEntityClass

class FollowEntity(
    id: EntityID<CompositeID>,
) : CompositeEntity(id) {
    companion object : CompositeEntityClass<FollowEntity>(FollowTable)

    val followerId by FollowTable.followerId
    val followingId by FollowTable.followingId
    val follower by AccountEntity referencedOn FollowTable.followerId
    val following by AccountEntity referencedOn FollowTable.followingId
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Account'))).toStrictEqual({
      fileName: 'AccountEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class AccountEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, AccountEntity>(AccountTable)

    val followers by FollowEntity referrersOn FollowTable.followerId
    val following by FollowEntity referrersOn FollowTable.followingId
    val owned by SharedEntity referrersOn SharedTable.ownerId
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Shared'))).toStrictEqual({
      fileName: 'SharedTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object SharedTable : IdTable<Int>("\\"Shared\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val ownerId =
        reference(
            "ownerId",
            AccountTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "shared_owner_fkey",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Shared_pkey\\"")

    init {
        foreignKey(
            ownerId to AccountTable.id,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Shared_alias_FK\\"",
        )
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Shared'))).toStrictEqual({
      fileName: 'SharedEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class SharedEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, SharedEntity>(SharedTable)

    var ownerId by SharedTable.ownerId
    var owner by AccountEntity referencedOn SharedTable.ownerId
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Tiny'))).toStrictEqual({
      fileName: 'TinyTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object TinyTable : IdTable<Short>("\\"Tiny\\"") {
    override val id = pgSmallserial("id").databaseGenerated().entityId()
    override val primaryKey = PrimaryKey(id, name = "\\"Tiny_pkey\\"")
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'TinyRef'))).toStrictEqual({
      fileName: 'TinyRefTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object TinyRefTable : IdTable<Int>("\\"TinyRef\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val tinyId =
        short("tinyId").references(
            TinyTable.id,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"TinyRef_tinyId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"TinyRef_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'TinyRef'))).toStrictEqual({
      fileName: 'TinyRefEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class TinyRefEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, TinyRefEntity>(TinyRefTable)

    var tinyId by TinyRefTable.tinyId
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Tiny'))).toStrictEqual({
      fileName: 'TinyEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class TinyEntity(
    id: EntityID<Short>,
) : Entity<Short>(id) {
    companion object : EntityClass<Short, TinyEntity>(TinyTable)
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Line'))).toStrictEqual({
      fileName: 'LineTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object LineTable : IdTable<Int>("\\"Line\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val book = text("book")
    val seq = integer("seq")
    val otherBook = text("otherBook")
    val otherSeq = integer("otherSeq")
    override val primaryKey = PrimaryKey(id, name = "\\"Line_pkey\\"")

    init {
        foreignKey(
            book to LedgerTable.book,
            seq to LedgerTable.seq,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Line_book_seq_fkey\\"",
        )
        foreignKey(
            otherBook to LedgerTable.book,
            otherSeq to LedgerTable.seq,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Line_otherBook_otherSeq_fkey\\"",
        )
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Line'))).toStrictEqual({
      fileName: 'LineEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class LineEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, LineEntity>(LineTable)

    var book by LineTable.book
    var seq by LineTable.seq
    var otherBook by LineTable.otherBook
    var otherSeq by LineTable.otherSeq
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Ledger'))).toStrictEqual({
      fileName: 'LedgerEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.CompositeEntity
import org.jetbrains.exposed.v1.dao.CompositeEntityClass

class LedgerEntity(
    id: EntityID<CompositeID>,
) : CompositeEntity(id) {
    companion object : CompositeEntityClass<LedgerEntity>(LedgerTable)

    val book by LedgerTable.book
    val seq by LedgerTable.seq
}
`,
    })
  })

  it('leaves to the database a default Kotlin has no sure spelling of', () => {
    const { datamodel, plan } = fixture(`model Odd {
  id    Int       @id
  small Int       @default(7) @db.SmallInt
  yes   Boolean   @default(false) @db.Boolean
  guid  String    @default("8f1d3b4a-2c6e-4f7a-9b0c-1d2e3f4a5b6c") @db.Uuid
  zone  DateTime  @default("2024-01-02T03:04:05+02:00") @db.Timetz(3)
  blobs Bytes[]   @default(["aGk=", ""])
  flags Boolean[] @default([true, false])
  big   BigInt    @default(-9223372036854775808)
  tiny  Float     @default(0.000001)
  whole Float     @default(3)
  exact Decimal   @default(0.1234567890123456789)
  doc   Json      @default("{\\"a\\": \\"it's\\"}")
}

model Numbered {
  id Int @id @default(autoincrement()) @db.Oid
}
`)
    expect(tableFile(plan, model(datamodel, 'Odd'))).toStrictEqual({
      fileName: 'OddTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.BasicBinaryColumnType
import org.jetbrains.exposed.v1.core.BooleanColumnType
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.json.jsonb
import java.math.BigDecimal
import java.util.Base64
import java.util.UUID

object OddTable : IdTable<Int>("\\"Odd\\"") {
    override val id = integer("id").entityId()
    val small = short("small").default(7)
    val yes = bool("yes").default(false)
    val guid = javaUUID("guid").default(UUID.fromString("8f1d3b4a-2c6e-4f7a-9b0c-1d2e3f4a5b6c"))
    val zone = pgTimetz("zone", 3).databaseDefault("'2024-01-02 03:04:05 +02:00'")
    val blobs =
        array("blobs", BasicBinaryColumnType())
            .nullable()
            .databaseDefault("'{\\"\\\\\\\\x6869\\",\\"\\\\\\\\x\\"}'") { listOf(Base64.getDecoder().decode("aGk="), Base64.getDecoder().decode("")) }
    val flags = array("flags", BooleanColumnType()).nullable().databaseDefault("'{\\"true\\",\\"false\\"}'") { listOf(true, false) }
    val big = long("big").default(Long.MIN_VALUE)
    val tiny = double("tiny").default(0.000001)
    val whole = double("whole").default(3.0)
    val exact = decimal("exact", 65, 30).default(BigDecimal("0.1234567890123456789"))
    val doc = jsonb<String>("doc", { it }, { it }).databaseDefault("'{\\"a\\": \\"it''s\\"}'") { "{\\"a\\": \\"it's\\"}" }
    override val primaryKey = PrimaryKey(id, name = "\\"Odd_pkey\\"")
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Numbered'))).toStrictEqual({
      fileName: 'NumberedTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object NumberedTable : IdTable<Long>("\\"Numbered\\"") {
    override val id = pgOid("id").entityId()
    override val primaryKey = PrimaryKey(id, name = "\\"Numbered_pkey\\"")
}
`,
    })
  })

  it('writes composite foreign keys in the table init block', () => {
    const { datamodel, plan } = fixture(`model Account {
  region String
  code   String
  name   String
  orders Order[]
  notes  Note[]

  @@id([region, code])
  @@unique([name, region])
}

model Order {
  id     Int     @id @default(autoincrement())
  region String
  code   String
  account Account @relation(fields: [region, code], references: [region, code], map: "order_account")
}

model Note {
  id      Int     @id @default(autoincrement())
  name    String
  region  String
  account Account @relation(fields: [name, region], references: [name, region])
}
`)
    expect(tableFile(plan, model(datamodel, 'Order'))).toStrictEqual({
      fileName: 'OrderTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object OrderTable : IdTable<Int>("\\"Order\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val region = text("region")
    val code = text("code")
    override val primaryKey = PrimaryKey(id, name = "\\"Order_pkey\\"")

    init {
        foreignKey(
            region to AccountTable.region,
            code to AccountTable.code,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "order_account",
        )
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Order'))).toStrictEqual({
      fileName: 'OrderEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class OrderEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, OrderEntity>(OrderTable)

    var region by OrderTable.region
    var code by OrderTable.code
    var account by AccountEntity referencedOn OrderTable
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Note'))).toStrictEqual({
      fileName: 'NoteTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object NoteTable : IdTable<Int>("\\"Note\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("name")
    val region = text("region")
    override val primaryKey = PrimaryKey(id, name = "\\"Note_pkey\\"")

    init {
        foreignKey(
            name to AccountTable.name,
            region to AccountTable.region,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Note_name_region_fkey\\"",
        )
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Note'))).toStrictEqual({
      fileName: 'NoteEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class NoteEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, NoteEntity>(NoteTable)

    var name by NoteTable.name
    var region by NoteTable.region
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Account'))).toStrictEqual({
      fileName: 'AccountEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.CompositeEntity
import org.jetbrains.exposed.v1.dao.CompositeEntityClass

class AccountEntity(
    id: EntityID<CompositeID>,
) : CompositeEntity(id) {
    companion object : CompositeEntityClass<AccountEntity>(AccountTable)

    val region by AccountTable.region
    val code by AccountTable.code
    var name by AccountTable.name
    val orders by OrderEntity referrersOn OrderTable
}
`,
    })
  })

  it('writes an index per @@index, with its method, operator classes and order', () => {
    const { datamodel, plan } = fixture(`model Indexed {
  id    Int      @id @default(autoincrement())
  name  String
  n     Int
  doc   Json     @db.JsonB
  tags  String[]
  addr  String   @db.Inet
  u     String   @db.Uuid
  email String   @unique(map: "indexed_email")

  @@index([name])
  @@index([name(ops: raw("text_pattern_ops"))], map: "indexed_name_pattern")
  @@index([n(sort: Desc), name])
  @@index([doc(ops: JsonbPathOps)], type: Gin)
  @@index([tags], type: Gin)
  @@index([addr(ops: InetOps)], type: Gist)
  @@index([name], type: SpGist, map: "indexed_name_spgist")
  @@index([n, u(ops: UuidMinMaxMultiOps)], type: Brin)
  @@index([n], type: Hash)
  @@unique([name(sort: Desc), n])
  @@unique([n, u], map: "indexed_n_u")
}
`)
    expect(tableFile(plan, model(datamodel, 'Indexed'))).toStrictEqual({
      fileName: 'IndexedTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.json.jsonb

object IndexedTable : IdTable<Int>("\\"Indexed\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("name")
    val n = integer("n")
    val doc = jsonb<String>("doc", { it }, { it })
    val tags = array("tags", TextColumnType()).nullable()
    val addr = pgInet("addr")
    val u = javaUUID("u")
    val email = text("email").uniqueIndex("indexed_email")
    override val primaryKey = PrimaryKey(id, name = "\\"Indexed_pkey\\"")

    init {
        index("\\"Indexed_name_idx\\"", false, name)
        index("indexed_name_pattern", false, functions = listOf(indexExpression("\\"name\\" text_pattern_ops")))
        index("\\"Indexed_n_name_idx\\"", false, functions = listOf(indexExpression("\\"n\\" DESC"), indexExpression("\\"name\\"")))
        index("\\"Indexed_doc_idx\\"", false, functions = listOf(indexExpression("\\"doc\\" jsonb_path_ops")), indexType = "gin")
        index("\\"Indexed_tags_idx\\"", false, tags, indexType = "gin")
        index("\\"Indexed_addr_idx\\"", false, functions = listOf(indexExpression("\\"addr\\" inet_ops")), indexType = "gist")
        index("indexed_name_spgist", false, name, indexType = "spgist")
        index(
            "\\"Indexed_n_u_idx\\"",
            false,
            functions = listOf(indexExpression("\\"n\\""), indexExpression("\\"u\\" uuid_minmax_multi_ops")),
            indexType = "brin",
        )
        index("\\"Indexed_n_idx\\"", false, n, indexType = "hash")
        uniqueIndex("\\"Indexed_name_n_key\\"", functions = listOf(indexExpression("\\"name\\" DESC"), indexExpression("\\"n\\"")))
        uniqueIndex("indexed_n_u", n, u)
    }
}
`,
    })
  })

  it('quotes and qualifies names the way Exposed hands them to PostgreSQL', () => {
    const { datamodel, plan } = fixture(`datasource db {
  provider = "postgresql"
  schemas  = ["public", "audit", "Mixed"]
}

enum Level {
  LOW
  HIGH

  @@map("level")
  @@schema("audit")
}

model Quoted {
  id     Int    @id @default(autoincrement())
  NAME   String
  dotted String @map("a.b")
  First  String @map("First Name")
  level  Level

  @@map("quoted")
  @@schema("audit")
}

model Lower {
  id Int @id @default(autoincrement())

  @@map("lower_table")
  @@schema("audit")
}

model Dotted {
  id   Int    @id @default(autoincrement())
  name String @unique

  @@map("dot.table")
  @@schema("Mixed")
}

model Public {
  id Int @id @default(autoincrement())

  @@schema("public")
}
`)
    expect(tableFile(plan, model(datamodel, 'Quoted'))).toStrictEqual({
      fileName: 'QuotedTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object QuotedTable : IdTable<Int>("audit.quoted") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("\\"NAME\\"")
    val dotted = text("\\"a.b\\"")
    val first = text("First Name")
    val level = pgEnum("level", "\\"audit\\".\\"level\\"", Level.entries, Level::dbName)
    override val primaryKey = PrimaryKey(id, name = "quoted_pkey")
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Lower'))).toStrictEqual({
      fileName: 'LowerTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object LowerTable : IdTable<Int>("audit.lower_table") {
    override val id = integer("id").autoIncrement().entityId()
    override val primaryKey = PrimaryKey(id, name = "lower_table_pkey")
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Dotted'))).toStrictEqual({
      fileName: 'DottedTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object DottedTable : IdTable<Int>("\\"Mixed\\".\\"dot.table\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("name").uniqueIndex("\\"dot.table_name_key\\"")
    override val primaryKey = PrimaryKey(id, name = "\\"dot.table_pkey\\"")
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Public'))).toStrictEqual({
      fileName: 'PublicTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object PublicTable : IdTable<Int>("\\"public\\".\\"Public\\"") {
    override val id = integer("id").autoIncrement().entityId()
    override val primaryKey = PrimaryKey(id, name = "\\"Public_pkey\\"")
}
`,
    })
    expect(schemaFile(plan)).toStrictEqual({
      fileName: 'PrismaSchema.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = listOf(Schema("\\"Mixed\\""), Schema("audit"), Schema("public"))
    val enumTypes: List<String> = listOf("CREATE TYPE \\"audit\\".\\"level\\" AS ENUM ('LOW', 'HIGH')")
    val tables: List<Table> = listOf(QuotedTable, LowerTable, DottedTable, PublicTable)
}
`,
    })
  })

  it('names properties apart from the members Exposed declares and from Kotlin keywords', () => {
    const { datamodel, plan } = fixture(`enum List {
  ONE
}

enum Instant {
  NOW
}

model Clash {
  id          Int      @id @default(autoincrement())
  columns     String
  tableName   String
  primaryKey  String
  db          String
  klass       String
  when        String
  object      String
  in          Int
  userId      Int
  UserId      Int
  sku_code    String
  URL         String
  list        List
  instant     Instant
  stamp       DateTime @default(now())
}
`)
    expect(tableFile(plan, model(datamodel, 'Clash'))).toStrictEqual({
      fileName: 'ClashTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.temporal.ChronoUnit
import java.time.Instant as TimeInstant

object ClashTable : IdTable<Int>("\\"Clash\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val columns1 = text("columns")
    val tableName1 = text("tableName")
    val primaryKey1 = text("primaryKey")
    val db = text("db")
    val klass = text("klass")
    val \`when\` = text("when")
    val \`object\` = text("object")
    val \`in\` = integer("in")
    val userId = integer("userId")
    val userId1 = integer("UserId")
    val skuCode = text("sku_code")
    val url = text("\\"URL\\"")
    val list = pgEnum("list", "\\"List\\"", List.entries, List::dbName)
    val instant = pgEnum("instant", "\\"Instant\\"", Instant.entries, Instant::dbName)
    val stamp = pgTimestamp("stamp", 3).databaseDefault("CURRENT_TIMESTAMP") { TimeInstant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "\\"Clash_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Clash'))).toStrictEqual({
      fileName: 'ClashEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class ClashEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, ClashEntity>(ClashTable)

    var columns by ClashTable.columns1
    var tableName by ClashTable.tableName1
    var primaryKey by ClashTable.primaryKey1
    var db1 by ClashTable.db
    var klass1 by ClashTable.klass
    var \`when\` by ClashTable.\`when\`
    var \`object\` by ClashTable.\`object\`
    var \`in\` by ClashTable.\`in\`
    var userId by ClashTable.userId
    var userId1 by ClashTable.userId1
    var skuCode by ClashTable.skuCode
    var url by ClashTable.url
    var list by ClashTable.list
    var instant by ClashTable.instant
    var stamp by ClashTable.stamp
}
`,
    })
  })

  it('hands a name too long to quote over unquoted, and cuts names as Prisma does', () => {
    const { datamodel, plan } = fixture(`model AnExceedinglyLongModelNameThatKeepsGoingAndGoing {
  id                                                             Int    @id @default(autoincrement())
  anExceedinglyLongColumnNameThatAlsoKeepsGoing                   String
  anotherExceedinglyLongColumnNameThatKeepsGoingAndGoingOnAndOn Int

  @@unique([id, anExceedinglyLongColumnNameThatAlsoKeepsGoing])
  @@index([anotherExceedinglyLongColumnNameThatKeepsGoingAndGoingOnAndOn])
}
`)
    expect(
      tableFile(plan, model(datamodel, 'AnExceedinglyLongModelNameThatKeepsGoingAndGoing')),
    ).toStrictEqual({
      fileName: 'AnExceedinglyLongModelNameThatKeepsGoingAndGoingTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object AnExceedinglyLongModelNameThatKeepsGoingAndGoingTable : IdTable<Int>("\\"AnExceedinglyLongModelNameThatKeepsGoingAndGoing\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val anExceedinglyLongColumnNameThatAlsoKeepsGoing = text("anExceedinglyLongColumnNameThatAlsoKeepsGoing")
    val anotherExceedinglyLongColumnNameThatKeepsGoingAndGoingOnAndOn =
        integer("anotherExceedinglyLongColumnNameThatKeepsGoingAndGoingOnAndOn")
    override val primaryKey = PrimaryKey(id, name = "\\"AnExceedinglyLongModelNameThatKeepsGoingAndGoing_pkey\\"")

    init {
        index(
            "AnExceedinglyLongModelNameThatKeepsGoingAndGoing_anotherExc_idx",
            false,
            anotherExceedinglyLongColumnNameThatKeepsGoingAndGoingOnAndOn,
        )
        uniqueIndex("AnExceedinglyLongModelNameThatKeepsGoingAndGoing_id_anExcee_key", id, anExceedinglyLongColumnNameThatAlsoKeepsGoing)
    }
}
`,
    })
  })

  it('lays out what does not fit on a line the way ktlint does', () => {
    const { datamodel, plan } = fixture(`enum Level {
  LOW
  MEDIUM
  HIGH
  HIGHEST
  UNBEARABLE
  CATASTROPHIC
  EXTRAORDINARY
  UNPRECEDENTED
}

model Member {
  id      Int      @id @default(autoincrement())
  handle  String   @unique
  chained Chained?
  badges  Badge[]
}

model Chained {
  id     Int     @id @default(autoincrement())
  code   String? @unique @default("none")
  member Member? @relation(fields: [code], references: [handle])
  levels Level[] @default([LOW, MEDIUM, HIGH, HIGHEST, UNBEARABLE, CATASTROPHIC, EXTRAORDINARY, UNPRECEDENTED])
  n      Int
  name   String
  u      String  @db.Uuid

  @@index([n(sort: Desc), name(sort: Desc), u(sort: Desc)], map: "chained_everything_descending")
}

model Badge {
  id           Int    @id @default(autoincrement())
  memberHandle String
  member       Member @relation(fields: [memberHandle], references: [handle], onDelete: Cascade, map: "badge_member_handle_fkey")
}
`)
    expect(tableFile(plan, model(datamodel, 'Chained'))).toStrictEqual({
      fileName: 'ChainedTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.core.java.javaUUID

object ChainedTable : IdTable<Int>("\\"Chained\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val code =
        text("code")
            .references(
                MemberTable.handle,
                onDelete = ReferenceOption.SET_NULL,
                onUpdate = ReferenceOption.CASCADE,
                fkName = "\\"Chained_code_fkey\\"",
            ).nullable()
            .default("none")
            .uniqueIndex("\\"Chained_code_key\\"")
    val levels =
        array("levels", PgEnumColumnType("\\"Level\\"", Level.entries, Level::dbName))
            .nullable()
            .databaseDefault(
                "'{\\"LOW\\",\\"MEDIUM\\",\\"HIGH\\",\\"HIGHEST\\",\\"UNBEARABLE\\",\\"CATASTROPHIC\\",\\"EXTRAORDINARY\\",\\"UNPRECEDENTED\\"}'",
            ) {
                listOf(
                    Level.LOW,
                    Level.MEDIUM,
                    Level.HIGH,
                    Level.HIGHEST,
                    Level.UNBEARABLE,
                    Level.CATASTROPHIC,
                    Level.EXTRAORDINARY,
                    Level.UNPRECEDENTED,
                )
            }
    val n = integer("n")
    val name = text("name")
    val u = javaUUID("u")
    override val primaryKey = PrimaryKey(id, name = "\\"Chained_pkey\\"")

    init {
        index(
            "chained_everything_descending",
            false,
            functions = listOf(indexExpression("\\"n\\" DESC"), indexExpression("\\"name\\" DESC"), indexExpression("\\"u\\" DESC")),
        )
    }
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Badge'))).toStrictEqual({
      fileName: 'BadgeTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object BadgeTable : IdTable<Int>("\\"Badge\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val memberHandle =
        text("memberHandle").references(
            MemberTable.handle,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "badge_member_handle_fkey",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Badge_pkey\\"")
}
`,
    })
  })

  it('closes an entity with no properties right after its companion object', () => {
    const { datamodel, plan } = fixture(`model Lonely {
  id Int @id @default(autoincrement())
}
`)
    expect(entityFile(plan, model(datamodel, 'Lonely'))).toStrictEqual({
      fileName: 'LonelyEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class LonelyEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, LonelyEntity>(LonelyTable)
}
`,
    })
  })

  it('declares no index over a field DMMF leaves out', () => {
    const { datamodel, plan } = fixture(`model Doc {
  id     Int                      @id @default(autoincrement())
  title  String
  search Unsupported("tsvector")?

  @@index([search], type: Gin)
  @@index([title])
}
`)
    expect(tableFile(plan, model(datamodel, 'Doc'))).toStrictEqual({
      fileName: 'DocTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object DocTable : IdTable<Int>("\\"Doc\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val title = text("title")
    override val primaryKey = PrimaryKey(id, name = "\\"Doc_pkey\\"")

    init {
        index("\\"Doc_title_idx\\"", false, title)
    }
}
`,
    })
  })

  it('declares a foreign key between columns of different types apart from the column', () => {
    const { datamodel, plan } = fixture(`model Small {
  id   Int   @id @db.SmallInt
  refs Ref[]
}

model Code {
  code String @id @db.VarChar(40)
  refs Ref[]
}

model Label {
  id   Int    @id
  name String @unique @db.VarChar(20)
  refs Ref[]
}

model Ref {
  id        Int    @id @default(autoincrement())
  smallId   Int
  small     Small  @relation(fields: [smallId], references: [id])
  codeId    String
  code      Code   @relation(fields: [codeId], references: [code])
  labelName String
  label     Label  @relation(fields: [labelName], references: [name])
}
`)
    expect(tableFile(plan, model(datamodel, 'Ref'))).toStrictEqual({
      fileName: 'RefTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object RefTable : IdTable<Int>("\\"Ref\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val smallId = integer("smallId")
    val codeId =
        text("codeId").references(
            CodeTable.id,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Ref_codeId_fkey\\"",
        )
    val labelName =
        text("labelName").references(
            LabelTable.name,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Ref_labelName_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Ref_pkey\\"")

    init {
        foreignKey(
            smallId to SmallTable.id,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Ref_smallId_fkey\\"",
        )
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Ref'))).toStrictEqual({
      fileName: 'RefEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class RefEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, RefEntity>(RefTable)

    var smallId by RefTable.smallId
    var codeId by RefTable.codeId
    var labelName by RefTable.labelName
    var label by LabelEntity referencedOn RefTable.labelName
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Small'))).toStrictEqual({
      fileName: 'SmallEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class SmallEntity(
    id: EntityID<Short>,
) : Entity<Short>(id) {
    companion object : EntityClass<Short, SmallEntity>(SmallTable)
}
`,
    })
  })

  it('joins a smallserial key by a smallint column the DAO does not follow', () => {
    const { datamodel, plan } = fixture(`model Tiny {
  id     Int     @id @default(autoincrement()) @db.SmallInt
  others Other[]
}

model Other {
  id    Int    @id @default(autoincrement())
  tinys Tiny[]
}
`)
    expect(joinTableFile(plan, plan.manyToMany[0])).toStrictEqual({
      fileName: 'OtherToTinyTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.Table

object OtherToTinyTable : Table("\\"_OtherToTiny\\"") {
    val a =
        reference(
            "\\"A\\"",
            OtherTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"_OtherToTiny_A_fkey\\"",
        )
    val b =
        short("\\"B\\"").references(
            TinyTable.id,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"_OtherToTiny_B_fkey\\"",
        )
    override val primaryKey = PrimaryKey(a, b, name = "\\"_OtherToTiny_AB_pkey\\"")

    init {
        index("\\"_OtherToTiny_B_index\\"", false, b)
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Tiny'))).toStrictEqual({
      fileName: 'TinyEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class TinyEntity(
    id: EntityID<Short>,
) : Entity<Short>(id) {
    companion object : EntityClass<Short, TinyEntity>(TinyTable)
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Other'))).toStrictEqual({
      fileName: 'OtherEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class OtherEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, OtherEntity>(OtherTable)
}
`,
    })
  })

  it('restricts the delete of a row a composite foreign key with a required column references', () => {
    const { datamodel, plan } = fixture(`model Grid {
  x     Int
  y     Int
  mixes Mix[]

  @@id([x, y])
}

model Mix {
  id   Int   @id
  mx   Int?
  my   Int
  grid Grid? @relation(fields: [mx, my], references: [x, y])
}
`)
    expect(tableFile(plan, model(datamodel, 'Mix'))).toStrictEqual({
      fileName: 'MixTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object MixTable : IdTable<Int>("\\"Mix\\"") {
    override val id = integer("id").entityId()
    val mx = integer("mx").nullable()
    val my = integer("my")
    override val primaryKey = PrimaryKey(id, name = "\\"Mix_pkey\\"")

    init {
        foreignKey(
            mx to GridTable.x,
            my to GridTable.y,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Mix_mx_my_fkey\\"",
        )
    }
}
`,
    })
  })

  it('declares first the columns a table-level foreign key on a cycle references', () => {
    const { datamodel, plan } = fixture(`model Hen {
  id    Int   @id
  eggId Int?
  egg   Egg?  @relation("laid", fields: [eggId], references: [id])
  x     Int
  y     Int
  eggs  Egg[] @relation("from")

  @@unique([x, y])
}

model Egg {
  id   Int   @id
  hx   Int
  hy   Int
  hen  Hen   @relation("from", fields: [hx, hy], references: [x, y])
  hens Hen[] @relation("laid")
}
`)
    expect(tableFile(plan, model(datamodel, 'Hen'))).toStrictEqual({
      fileName: 'HenTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object HenTable : IdTable<Int>("\\"Hen\\"") {
    val x = integer("x")
    val y = integer("y")
    override val id = integer("id").entityId()
    val eggId =
        optReference(
            "eggId",
            EggTable,
            onDelete = ReferenceOption.SET_NULL,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Hen_eggId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Hen_pkey\\"")

    init {
        uniqueIndex("\\"Hen_x_y_key\\"", x, y)
    }
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Egg'))).toStrictEqual({
      fileName: 'EggTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object EggTable : IdTable<Int>("\\"Egg\\"") {
    override val id = integer("id").entityId()
    val hx = integer("hx")
    val hy = integer("hy")
    override val primaryKey = PrimaryKey(id, name = "\\"Egg_pkey\\"")

    init {
        foreignKey(
            hx to HenTable.x,
            hy to HenTable.y,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            name = "\\"Egg_hx_hy_fkey\\"",
        )
    }
}
`,
    })
  })

  it('references a column named like a Kotlin keyword', () => {
    const { datamodel, plan } = fixture(`model Npm {
  id       Int       @id
  package  String    @unique
  versions Version[]
}

model Version {
  id      Int    @id
  pkgName String
  npm     Npm    @relation(fields: [pkgName], references: [package])
}
`)
    expect(tableFile(plan, model(datamodel, 'Version'))).toStrictEqual({
      fileName: 'VersionTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object VersionTable : IdTable<Int>("\\"Version\\"") {
    override val id = integer("id").entityId()
    val pkgName =
        text("pkgName").references(
            NpmTable.\`package\`,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Version_pkgName_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Version_pkey\\"")
}
`,
    })
  })

  it('does not follow a foreign key to a column that is a reference itself', () => {
    const { datamodel, plan } = fixture(`model User {
  id      Int      @id
  profile Profile?
}

model Profile {
  id     Int    @id
  userId Int    @unique
  user   User   @relation(fields: [userId], references: [id])
  posts  Post[]
}

model Post {
  id            Int     @id @default(autoincrement())
  profileUserId Int
  profile       Profile @relation(fields: [profileUserId], references: [userId])
}
`)
    expect(tableFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object PostTable : IdTable<Int>("\\"Post\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val profileUserId =
        integer("profileUserId").references(
            ProfileTable.userId,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Post_profileUserId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Post_pkey\\"")
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PostEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, PostEntity>(PostTable)

    var profileUserId by PostTable.profileUserId
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Profile'))).toStrictEqual({
      fileName: 'ProfileEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class ProfileEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, ProfileEntity>(ProfileTable)

    var userId by ProfileTable.userId
    var user by UserEntity referencedOn ProfileTable.userId
}
`,
    })
  })

  it('leaves out the views, for which Prisma Migrate creates no table', () => {
    const { plan } = fixture(`datasource db {
  provider = "postgresql"
}

generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["views"]
}

model User {
  id   Int    @id
  name String
}

view UserInfo {
  id   Int    @unique
  name String
}
`)
    expect(schemaFile(plan)).toStrictEqual({
      fileName: 'PrismaSchema.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = emptyList()
    val enumTypes: List<String> = emptyList()
    val tables: List<Table> = listOf(UserTable)
}
`,
    })
  })

  it('declares no foreign key, and follows no relation, with relationMode prisma', () => {
    const { datamodel, plan } = fixture(`datasource db {
  provider     = "postgresql"
  relationMode = "prisma"
}

model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
  tags  Tag[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([authorId])
}

model Tag {
  id    Int    @id @default(autoincrement())
  users User[]
}
`)
    expect(tableFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object PostTable : IdTable<Int>("\\"Post\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val authorId = integer("authorId")
    override val primaryKey = PrimaryKey(id, name = "\\"Post_pkey\\"")

    init {
        index("\\"Post_authorId_idx\\"", false, authorId)
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PostEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, PostEntity>(PostTable)

    var authorId by PostTable.authorId
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'User'))).toStrictEqual({
      fileName: 'UserEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class UserEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, UserEntity>(UserTable)
}
`,
    })
    expect(joinTableFile(plan, plan.manyToMany[0])).toStrictEqual({
      fileName: 'TagToUserTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Table

object TagToUserTable : Table("\\"_TagToUser\\"") {
    val a = entityId("\\"A\\"", TagTable)
    val b = entityId("\\"B\\"", UserTable)
    override val primaryKey = PrimaryKey(a, b, name = "\\"_TagToUser_AB_pkey\\"")

    init {
        index("\\"_TagToUser_B_index\\"", false, b)
    }
}
`,
    })
  })

  it('writes the condition of a partial index as Prisma Migrate does', () => {
    const { datamodel, plan } = fixture(`datasource db {
  provider = "postgresql"
}

generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

enum Status {
  ACTIVE @map("active")
  GONE
}

model Account {
  id     Int     @id
  email  String
  alive  Boolean
  n      Int
  status Status?
  note   String?

  @@unique([email], where: raw("alive"))
  @@unique([n], where: { status: "active" }, map: "account_n_active")
  @@index([alive], where: { alive: true })
  @@index([n], where: { note: "it's", status: { not: null }, n: { not: 5 } }, map: "account_multi")
}
`)
    expect(tableFile(plan, model(datamodel, 'Account'))).toStrictEqual({
      fileName: 'AccountTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object AccountTable : IdTable<Int>("\\"Account\\"") {
    override val id = integer("id").entityId()
    val email = text("email")
    val alive = bool("alive")
    val n = integer("n")
    val status = pgEnum("status", "\\"Status\\"", Status.entries, Status::dbName).nullable()
    val note = text("note").nullable()
    override val primaryKey = PrimaryKey(id, name = "\\"Account_pkey\\"")

    init {
        index("\\"Account_alive_idx\\"", false, alive, filterCondition = sqlCondition("(\\"alive\\" = true)"))
        index("account_multi", false, n, filterCondition = sqlCondition("(\\"note\\" = 'it''s' AND \\"status\\" IS NOT NULL AND \\"n\\" != 5)"))
        uniqueIndex("\\"Account_email_key\\"", email, filterCondition = sqlCondition("(alive)"))
        uniqueIndex("account_n_active", n, filterCondition = sqlCondition("(\\"status\\" = 'active')"))
    }
}
`,
    })
    expect(supportFile(plan)).toStrictEqual({
      fileName: 'ColumnTypes.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.ColumnType
import org.jetbrains.exposed.v1.core.Op
import org.jetbrains.exposed.v1.core.QueryBuilder
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.statements.api.RowApi

internal class SqlCondition(
    private val sql: String,
) : Op<Boolean>() {
    override fun toQueryBuilder(queryBuilder: QueryBuilder) {
        queryBuilder.append(sql)
    }
}

internal fun sqlCondition(sql: String): () -> Op<Boolean> = { SqlCondition(sql) }

internal class PgEnumColumnType<E : Enum<E>>(
    val typeName: String,
    val entries: List<E>,
    val dbName: (E) -> String,
) : ColumnType<E>() {
    override fun sqlType(): String = typeName

    override fun valueFromDB(value: Any): E =
        entries.firstOrNull { it == value }
            ?: entries.firstOrNull { dbName(it) == value.toString() }
            ?: error("Unexpected value of $typeName: $value")

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getString(index)

    override fun notNullValueToDB(value: E): Any = dbName(value)

    override fun nonNullValueToString(value: E): String = "'\${dbName(value).replace("'", "''")}'"

    override fun parameterMarker(value: E?): String = "?::$typeName"
}

internal fun <E : Enum<E>> Table.pgEnum(
    name: String,
    typeName: String,
    entries: List<E>,
    dbName: (E) -> String,
): Column<E> = registerColumn(name, PgEnumColumnType(typeName, entries, dbName))
`,
    })
  })

  it('stamps @updatedAt on the columns an entity can set', () => {
    const { datamodel, plan } = fixture(`model Stamp {
  at    DateTime @updatedAt
  name  String
  batch DateTime @updatedAt

  @@id([at, name])
}
`)
    expect(entityFile(plan, model(datamodel, 'Stamp'))).toStrictEqual({
      fileName: 'StampEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.CompositeEntity
import org.jetbrains.exposed.v1.dao.CompositeEntityClass
import org.jetbrains.exposed.v1.dao.EntityBatchUpdate
import java.time.Instant
import java.time.temporal.ChronoUnit

class StampEntity(
    id: EntityID<CompositeID>,
) : CompositeEntity(id) {
    companion object : CompositeEntityClass<StampEntity>(StampTable)

    val at by StampTable.at
    val name by StampTable.name
    var batch by StampTable.batch

    override fun flush(batch: EntityBatchUpdate?): Boolean {
        if (writeValues.isNotEmpty()) {
            if (!isWritten(StampTable.batch)) {
                this.batch = Instant.now().truncatedTo(ChronoUnit.MILLIS)
            }
        }
        return super.flush(batch)
    }
}
`,
    })
  })

  it('names a type apart from the class the support file compiles into', () => {
    const { datamodel, plan } = fixture(`enum ColumnTypesKt {
  A
}

model Kind {
  id   Int           @id
  kind ColumnTypesKt
}
`)
    expect(enumFile(plan, enumOf(datamodel, 'ColumnTypesKt'))).toStrictEqual({
      fileName: 'ColumnTypesKt1.kt',
      code: `package models

enum class ColumnTypesKt1(
    val dbName: String,
) {
    A("A"),
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Kind'))).toStrictEqual({
      fileName: 'KindTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object KindTable : IdTable<Int>("\\"Kind\\"") {
    override val id = integer("id").entityId()
    val kind = pgEnum("kind", "\\"ColumnTypesKt\\"", ColumnTypesKt1.entries, ColumnTypesKt1::dbName)
    override val primaryKey = PrimaryKey(id, name = "\\"Kind_pkey\\"")
}
`,
    })
  })

  it('writes the tables alone when dao is false', () => {
    const { datamodel, plan } = fixture(
      `model User {
  id        Int      @id @default(autoincrement())
  updatedAt DateTime @updatedAt
  posts     Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`,
      { ...DEFAULT_OPTIONS, dao: false },
    )
    expect(tableFile(plan, model(datamodel, 'User'))).toStrictEqual({
      fileName: 'UserTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.temporal.ChronoUnit

object UserTable : IdTable<Int>("\\"User\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val updatedAt = pgTimestamp("updatedAt", 3).clientDefault { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "\\"User_pkey\\"")
}
`,
    })
    expect(tableFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object PostTable : IdTable<Int>("\\"Post\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val authorId =
        reference(
            "authorId",
            UserTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"Post_authorId_fkey\\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\\"Post_pkey\\"")
}
`,
    })
    expect(schemaFile(plan)).toStrictEqual({
      fileName: 'PrismaSchema.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = emptyList()
    val enumTypes: List<String> = emptyList()
    val tables: List<Table> = listOf(UserTable, PostTable)
}
`,
    })
    expect(supportFile(plan)).toStrictEqual({
      fileName: 'ColumnTypes.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.ColumnType
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.statements.api.RowApi
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset

internal class PgTimestampColumnType(
    val precision: Int? = null,
) : ColumnType<Instant>() {
    override fun sqlType(): String = if (precision == null) "TIMESTAMP" else "TIMESTAMP($precision)"

    override fun valueFromDB(value: Any): Instant =
        when (value) {
            is Instant -> value
            is LocalDateTime -> value.toInstant(ZoneOffset.UTC)
            else -> error("Unexpected value of type \${value::class.qualifiedName}: $value")
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, LocalDateTime::class.java)

    override fun notNullValueToDB(value: Instant): Any = LocalDateTime.ofInstant(value, ZoneOffset.UTC)

    override fun nonNullValueToString(value: Instant): String = "'\${notNullValueToDB(value)}'"
}

internal fun Table.pgTimestamp(
    name: String,
    precision: Int? = null,
): Column<Instant> = registerColumn(name, PgTimestampColumnType(precision))
`,
    })
  })
})

describe('joinTableFile', () => {
  it('writes the A and B columns of an implicit many-to-many relation and follows it via the join table', () => {
    const { datamodel, plan } = fixture(`model Post {
  id   Int   @id @default(autoincrement())
  tags Tag[]
}

model Tag {
  name  String @id
  posts Post[]
}
`)
    expect(joinTableFile(plan, plan.manyToMany[0])).toStrictEqual({
      fileName: 'PostToTagTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.Table

object PostToTagTable : Table("\\"_PostToTag\\"") {
    val a =
        reference(
            "\\"A\\"",
            PostTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"_PostToTag_A_fkey\\"",
        )
    val b =
        reference(
            "\\"B\\"",
            TagTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"_PostToTag_B_fkey\\"",
        )
    override val primaryKey = PrimaryKey(a, b, name = "\\"_PostToTag_AB_pkey\\"")

    init {
        index("\\"_PostToTag_B_index\\"", false, b)
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Post'))).toStrictEqual({
      fileName: 'PostEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PostEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, PostEntity>(PostTable)

    var tags by TagEntity via PostToTagTable
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Tag'))).toStrictEqual({
      fileName: 'TagEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class TagEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, TagEntity>(TagTable)

    var posts by PostEntity via PostToTagTable
}
`,
    })
  })

  it('follows a self-relation through both of its columns', () => {
    const { datamodel, plan } = fixture(`datasource db {
  provider = "postgresql"
  schemas  = ["audit"]
}

model Member {
  id        String   @id @default(uuid()) @db.Uuid
  friends   Member[] @relation("friends-of")
  friendsOf Member[] @relation("friends-of")

  @@schema("audit")
}
`)
    expect(joinTableFile(plan, plan.manyToMany[0])).toStrictEqual({
      fileName: 'FriendsOfTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.Table

object FriendsOfTable : Table("audit._friends-of") {
    val a =
        reference(
            "\\"A\\"",
            MemberTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"_friends-of_A_fkey\\"",
        )
    val b =
        reference(
            "\\"B\\"",
            MemberTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\\"_friends-of_B_fkey\\"",
        )
    override val primaryKey = PrimaryKey(a, b, name = "\\"_friends-of_AB_pkey\\"")

    init {
        index("\\"_friends-of_B_index\\"", false, b)
    }
}
`,
    })
    expect(entityFile(plan, model(datamodel, 'Member'))).toStrictEqual({
      fileName: 'MemberEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass
import java.util.UUID

class MemberEntity(
    id: EntityID<UUID>,
) : Entity<UUID>(id) {
    companion object : EntityClass<UUID, MemberEntity>(MemberTable)

    var friends by MemberEntity.via(FriendsOfTable.a, FriendsOfTable.b)
    var friendsOf by MemberEntity.via(FriendsOfTable.b, FriendsOfTable.a)
}
`,
    })
  })
})

describe('enumFile', () => {
  it('writes each value with the label PostgreSQL knows it by', () => {
    const { datamodel, plan } = fixture(`enum Level {
  FOO_BAR
  fooBar @map("foo-bar")
  low
  in     @map("in-out")
  FooBar @map("say \\"hi\\"")
  name
  entries
  dbName

  @@map("level")
}
`)
    expect(enumFile(plan, enumOf(datamodel, 'Level'))).toStrictEqual({
      fileName: 'Level.kt',
      code: `package models

enum class Level(
    val dbName: String,
) {
    FOO_BAR("FOO_BAR"),
    FOO_BAR1("foo-bar"),
    LOW("low"),
    IN("in-out"),
    FooBar("say \\"hi\\""),
    NAME("name"),
    ENTRIES("entries"),
    DB_NAME("dbName"),
}
`,
    })
  })
})

describe('schemaFile and supportFile', () => {
  it('lists the tables, and writes no support file when no column needs one', () => {
    const { plan } = fixture(`model Plain {
  id   Int    @id @default(autoincrement())
  name String
}
`)
    expect(schemaFile(plan)).toStrictEqual({
      fileName: 'PrismaSchema.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = emptyList()
    val enumTypes: List<String> = emptyList()
    val tables: List<Table> = listOf(PlainTable)
}
`,
    })
    expect(supportFile(plan)).toBeNull()
  })

  it('writes only the declarations the tables use', () => {
    const { plan } = fixture(`enum Tone {
  WARM
}

model Tinted {
  id   Int  @id @default(autoincrement())
  tone Tone
}
`)
    expect(schemaFile(plan)).toStrictEqual({
      fileName: 'PrismaSchema.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = emptyList()
    val enumTypes: List<String> = listOf("CREATE TYPE \\"Tone\\" AS ENUM ('WARM')")
    val tables: List<Table> = listOf(TintedTable)
}
`,
    })
    expect(supportFile(plan)).toStrictEqual({
      fileName: 'ColumnTypes.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.ColumnType
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.statements.api.RowApi

internal class PgEnumColumnType<E : Enum<E>>(
    val typeName: String,
    val entries: List<E>,
    val dbName: (E) -> String,
) : ColumnType<E>() {
    override fun sqlType(): String = typeName

    override fun valueFromDB(value: Any): E =
        entries.firstOrNull { it == value }
            ?: entries.firstOrNull { dbName(it) == value.toString() }
            ?: error("Unexpected value of $typeName: $value")

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getString(index)

    override fun notNullValueToDB(value: E): Any = dbName(value)

    override fun nonNullValueToString(value: E): String = "'\${dbName(value).replace("'", "''")}'"

    override fun parameterMarker(value: E?): String = "?::$typeName"
}

internal fun <E : Enum<E>> Table.pgEnum(
    name: String,
    typeName: String,
    entries: List<E>,
    dbName: (E) -> String,
): Column<E> = registerColumn(name, PgEnumColumnType(typeName, entries, dbName))
`,
    })
  })

  it('writes every declaration some table uses', () => {
    const { plan } = fixture(`enum Tone {
  WARM
}

model Everything {
  id        Int        @id @default(autoincrement()) @db.SmallInt
  tone      Tone
  tones     Tone[]
  varchar   String     @db.VarChar
  citext    String     @db.Citext
  inet      String     @db.Inet
  xml       String     @db.Xml
  bit       String     @db.Bit(2)
  varbit    String     @db.VarBit
  numeric   Decimal    @db.Decimal
  money     Decimal    @db.Money
  oid       Int        @db.Oid
  stamp     DateTime   @default(now())
  zoned     DateTime   @db.Timestamptz(3)
  day       DateTime   @db.Date
  clock     DateTime   @db.Time(3)
  zonedTime DateTime   @db.Timetz(3)
  stamps    DateTime[]
  uuid7     String     @default(uuid(7))
  nanoid    String     @default(nanoid())
  trigger   String     @default(dbgenerated("upper('x')"))
  touched   DateTime   @updatedAt

  @@index([varchar(sort: Desc)])
}
`)
    expect(supportFile(plan)).toStrictEqual({
      fileName: 'ColumnTypes.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.ArrayColumnType
import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.ColumnType
import org.jetbrains.exposed.v1.core.Function
import org.jetbrains.exposed.v1.core.IColumnType
import org.jetbrains.exposed.v1.core.QueryBuilder
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.statements.api.PreparedStatementApi
import org.jetbrains.exposed.v1.core.statements.api.RowApi
import org.jetbrains.exposed.v1.dao.Entity
import java.math.BigDecimal
import java.security.SecureRandom
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.OffsetTime
import java.time.ZoneOffset
import java.util.UUID
import java.sql.Array as SqlArray

internal class SqlExpression<T>(
    private val sql: String,
    columnType: IColumnType<T & Any>,
) : Function<T>(columnType) {
    override fun toQueryBuilder(queryBuilder: QueryBuilder) {
        queryBuilder.append(sql)
    }
}

internal fun <T> Column<T>.databaseDefault(
    sql: String,
    value: (() -> T)? = null,
): Column<T> = with(table) { defaultExpression(SqlExpression(sql, columnType)).also { it.defaultValueFun = value } }

internal fun indexExpression(sql: String): Function<String> = SqlExpression(sql, TextColumnType())

internal class PgTimestampColumnType(
    val precision: Int? = null,
) : ColumnType<Instant>() {
    override fun sqlType(): String = if (precision == null) "TIMESTAMP" else "TIMESTAMP($precision)"

    override fun valueFromDB(value: Any): Instant =
        when (value) {
            is Instant -> value
            is LocalDateTime -> value.toInstant(ZoneOffset.UTC)
            else -> error("Unexpected value of type \${value::class.qualifiedName}: $value")
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, LocalDateTime::class.java)

    override fun notNullValueToDB(value: Instant): Any = LocalDateTime.ofInstant(value, ZoneOffset.UTC)

    override fun nonNullValueToString(value: Instant): String = "'\${notNullValueToDB(value)}'"
}

internal fun Table.pgTimestamp(
    name: String,
    precision: Int? = null,
): Column<Instant> = registerColumn(name, PgTimestampColumnType(precision))

internal class PgTimestamptzColumnType(
    val precision: Int? = null,
) : ColumnType<Instant>() {
    override fun sqlType(): String = if (precision == null) "TIMESTAMPTZ" else "TIMESTAMPTZ($precision)"

    override fun valueFromDB(value: Any): Instant =
        when (value) {
            is Instant -> value
            is OffsetDateTime -> value.toInstant()
            else -> error("Unexpected value of type \${value::class.qualifiedName}: $value")
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, OffsetDateTime::class.java)

    override fun notNullValueToDB(value: Instant): Any = value.atOffset(ZoneOffset.UTC)

    override fun nonNullValueToString(value: Instant): String = "'\${notNullValueToDB(value)}'"
}

internal fun Table.pgTimestamptz(
    name: String,
    precision: Int? = null,
): Column<Instant> = registerColumn(name, PgTimestamptzColumnType(precision))

internal class PgDateColumnType : ColumnType<LocalDate>() {
    override fun sqlType(): String = "DATE"

    override fun valueFromDB(value: Any): LocalDate =
        when (value) {
            is LocalDate -> value
            else -> error("Unexpected value of type \${value::class.qualifiedName}: $value")
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, LocalDate::class.java)

    override fun nonNullValueToString(value: LocalDate): String = "'$value'"
}

internal fun Table.pgDate(name: String): Column<LocalDate> = registerColumn(name, PgDateColumnType())

internal class PgTimeColumnType(
    val precision: Int? = null,
) : ColumnType<LocalTime>() {
    override fun sqlType(): String = if (precision == null) "TIME" else "TIME($precision)"

    override fun valueFromDB(value: Any): LocalTime =
        when (value) {
            is LocalTime -> value
            else -> error("Unexpected value of type \${value::class.qualifiedName}: $value")
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, LocalTime::class.java)

    override fun nonNullValueToString(value: LocalTime): String = "'$value'"
}

internal fun Table.pgTime(
    name: String,
    precision: Int? = null,
): Column<LocalTime> = registerColumn(name, PgTimeColumnType(precision))

internal class PgTimetzColumnType(
    val precision: Int? = null,
) : ColumnType<OffsetTime>() {
    override fun sqlType(): String = if (precision == null) "TIMETZ" else "TIMETZ($precision)"

    override fun valueFromDB(value: Any): OffsetTime =
        when (value) {
            is OffsetTime -> value
            else -> error("Unexpected value of type \${value::class.qualifiedName}: $value")
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, OffsetTime::class.java)

    override fun nonNullValueToString(value: OffsetTime): String = "'$value'"
}

internal fun Table.pgTimetz(
    name: String,
    precision: Int? = null,
): Column<OffsetTime> = registerColumn(name, PgTimetzColumnType(precision))

internal class PgEnumColumnType<E : Enum<E>>(
    val typeName: String,
    val entries: List<E>,
    val dbName: (E) -> String,
) : ColumnType<E>() {
    override fun sqlType(): String = typeName

    override fun valueFromDB(value: Any): E =
        entries.firstOrNull { it == value }
            ?: entries.firstOrNull { dbName(it) == value.toString() }
            ?: error("Unexpected value of $typeName: $value")

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getString(index)

    override fun notNullValueToDB(value: E): Any = dbName(value)

    override fun nonNullValueToString(value: E): String = "'\${dbName(value).replace("'", "''")}'"

    override fun parameterMarker(value: E?): String = "?::$typeName"
}

internal fun <E : Enum<E>> Table.pgEnum(
    name: String,
    typeName: String,
    entries: List<E>,
    dbName: (E) -> String,
): Column<E> = registerColumn(name, PgEnumColumnType(typeName, entries, dbName))

internal class PgStringColumnType(
    val typeName: String,
    val castName: String,
) : TextColumnType() {
    override fun sqlType(): String = typeName

    override fun valueFromDB(value: Any): String =
        when (value) {
            is Boolean -> if (value) "1" else "0"
            else -> value.toString()
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getString(index)

    override fun nonNullValueToString(value: String): String = "'\${value.replace("'", "''")}'"

    override fun parameterMarker(value: String?): String = "?::$castName"
}

internal fun Table.pgVarchar(name: String): Column<String> = registerColumn(name, PgStringColumnType("VARCHAR", "varchar"))

internal fun Table.pgCitext(name: String): Column<String> = registerColumn(name, PgStringColumnType("CITEXT", "citext"))

internal fun Table.pgInet(name: String): Column<String> = registerColumn(name, PgStringColumnType("INET", "inet"))

internal fun Table.pgXml(name: String): Column<String> = registerColumn(name, PgStringColumnType("XML", "xml"))

internal fun Table.pgBit(
    name: String,
    length: Int,
): Column<String> = registerColumn(name, PgStringColumnType("BIT($length)", "varbit"))

internal fun Table.pgVarbit(
    name: String,
    length: Int? = null,
): Column<String> = registerColumn(name, PgStringColumnType(if (length == null) "VARBIT" else "VARBIT($length)", "varbit"))

internal class PgNumericColumnType : ColumnType<BigDecimal>() {
    override fun sqlType(): String = "DECIMAL"

    override fun valueFromDB(value: Any): BigDecimal =
        when (value) {
            is BigDecimal -> value
            else -> BigDecimal(value.toString())
        }
}

internal fun Table.pgNumeric(name: String): Column<BigDecimal> = registerColumn(name, PgNumericColumnType())

internal class PgMoneyColumnType : ColumnType<BigDecimal>() {
    override fun sqlType(): String = "MONEY"

    override fun valueFromDB(value: Any): BigDecimal =
        when (value) {
            is BigDecimal -> {
                value
            }

            else -> {
                val text = value.toString()
                val number = text.filter { it.isDigit() || it == '.' || it == ',' }
                val point = number.lastIndexOfAny(charArrayOf('.', ','))
                val fraction = if (point >= 0 && number.length - point - 1 in 1..2) number.substring(point + 1) else ""
                val whole = number.substring(0, number.length - fraction.length).filter { it.isDigit() }
                val amount = BigDecimal(if (fraction.isEmpty()) whole else "$whole.$fraction")
                if ('-' in text || '(' in text) amount.negate() else amount
            }
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getString(index)

    override fun parameterMarker(value: BigDecimal?): String = "?::numeric::money"
}

internal fun Table.pgMoney(name: String): Column<BigDecimal> = registerColumn(name, PgMoneyColumnType())

internal class PgOidColumnType : ColumnType<Long>() {
    override fun sqlType(): String = "OID"

    override fun valueFromDB(value: Any): Long =
        when (value) {
            is Number -> value.toLong()
            else -> value.toString().toLong()
        }

    override fun parameterMarker(value: Long?): String = "?::oid"
}

internal fun Table.pgOid(name: String): Column<Long> = registerColumn(name, PgOidColumnType())

internal class PgSmallserialColumnType : ColumnType<Short>() {
    override fun sqlType(): String = "SMALLSERIAL"

    override fun valueFromDB(value: Any): Short =
        when (value) {
            is Number -> value.toShort()
            else -> value.toString().toShort()
        }
}

internal fun Table.pgSmallserial(name: String): Column<Short> = registerColumn(name, PgSmallserialColumnType())

internal class PgListColumnType<T : Any>(
    val element: ColumnType<T>,
    val elementClass: Class<*>,
) : ColumnType<List<T>>() {
    private val array = ArrayColumnType<T, List<T>>(element)

    override fun sqlType(): String = array.sqlType()

    override fun valueFromDB(value: Any): List<T> =
        when (value) {
            is SqlArray -> {
                value.resultSet.use { rows ->
                    buildList {
                        while (rows.next()) add(elementFromDB(read(rows)))
                    }
                }
            }

            is List<*> -> {
                value.map(::elementFromDB)
            }

            is Array<*> -> {
                value.map(::elementFromDB)
            }

            else -> {
                error("Unexpected value of type \${value::class.qualifiedName}: $value")
            }
        }

    private fun elementFromDB(value: Any?): T = value?.let(element::valueFromDB) ?: error("NULL in a list of \${element.sqlType()}")

    private fun read(rows: ResultSet): Any? = if (elementClass == String::class.java) rows.getString(2) else rows.getObject(2, elementClass)

    override fun notNullValueToDB(value: List<T>): Any = array.notNullValueToDB(value)

    override fun nonNullValueToString(value: List<T>): String = array.nonNullValueToString(value)

    override fun nonNullValueAsDefaultString(value: List<T>): String = array.nonNullValueAsDefaultString(value)

    override fun setParameter(
        stmt: PreparedStatementApi,
        index: Int,
        value: Any?,
    ) {
        array.setParameter(stmt, index, value)
    }
}

internal fun <T : Any> Table.pgList(
    name: String,
    element: ColumnType<T>,
    elementClass: Class<*>,
): Column<List<T>> = registerColumn(name, PgListColumnType(element, elementClass))

private val random = SecureRandom()

internal fun uuidV7(): UUID {
    val bytes = ByteArray(10).also(random::nextBytes)
    val randomA = ((bytes[0].toLong() and 0x0f) shl 8) or (bytes[1].toLong() and 0xff)
    val randomB = bytes.drop(2).fold(0L) { acc, byte -> (acc shl 8) or (byte.toLong() and 0xff) }
    return UUID((System.currentTimeMillis() shl 16) or 0x7000L or randomA, (randomB and 0x3fffffffffffffffL) or Long.MIN_VALUE)
}

internal fun nanoid(size: Int): String {
    val alphabet = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return CharArray(size) { alphabet[random.nextInt(alphabet.length)] }.concatToString()
}

internal fun Entity<*>.isWritten(column: Column<*>): Boolean = writeValues.keys.any { it == column }
`,
    })
  })
})

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

  // Prisma refuses a model without a unique criterion of required fields; a DMMF can still carry
  // one, and a plain Table is all Exposed can key it by.
  it('writes a plain Table, and no entity, for a model with no key', () => {
    const loose = modelOf({
      name: 'Loose',
      uniqueFields: [['region', 'code']],
      fields: [
        field({ name: 'region', type: 'String', isRequired: false }),
        field({ name: 'code', type: 'String' }),
      ],
    })
    const plan = planExposed({ models: [loose], enums: [] }, DEFAULT_OPTIONS)
    expect(tableFile(plan, loose)).toStrictEqual({
      fileName: 'LooseTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.Table

object LooseTable : Table("\\"Loose\\"") {
    val region = text("region").nullable()
    val code = text("code")

    init {
        uniqueIndex("\\"Loose_region_code_key\\"", region, code)
    }
}
`,
    })
    expect(plan.names.entities).toStrictEqual(new Map())
  })

  // The regression: without DMMF's indexes, a unique field's index was written twice, on its
  // column and again in the init block.
  it('reads keys and unique criteria off the models when DMMF has no indexes', () => {
    const pair = modelOf({
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
    })
    const plan = planExposed({ models: [pair], enums: [] }, DEFAULT_OPTIONS)
    expect(tableFile(plan, pair)).toStrictEqual({
      fileName: 'PairTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeIdTable

object PairTable : CompositeIdTable("\\"Pair\\"") {
    val a = integer("a").entityId()
    val b = integer("b").entityId()
    val c = integer("c")
    val d = integer("d")
    val e = text("e").uniqueIndex("\\"Pair_e_key\\"")
    override val primaryKey = PrimaryKey(a, b, name = "\\"Pair_pkey\\"")

    init {
        uniqueIndex("\\"Pair_c_d_key\\"", c, d)
    }
}
`,
    })
  })

  it('leaves out a relation to a model it does not have, or one whose fields do not pair up', () => {
    const orphan = modelOf({
      name: 'Orphan',
      fields: [
        field({ name: 'id', type: 'Int', isId: true }),
        field({ name: 'ghostId', type: 'Int' }),
        field({
          name: 'ghost',
          type: 'Ghost',
          kind: 'object',
          relationName: 'GhostToOrphan',
          relationFromFields: ['ghostId'],
          relationToFields: ['id'],
        }),
        field({ name: 'selfId', type: 'Int' }),
        field({
          name: 'self',
          type: 'Orphan',
          kind: 'object',
          relationName: 'OrphanToOrphan',
          relationFromFields: ['selfId'],
          relationToFields: ['id', 'selfId'],
        }),
      ],
    })
    const plan = planExposed({ models: [orphan], enums: [] }, DEFAULT_OPTIONS)
    expect(plan.foreignKeys).toStrictEqual([])
    expect(tableFile(plan, orphan)).toStrictEqual({
      fileName: 'OrphanTable.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object OrphanTable : IdTable<Int>("\\"Orphan\\"") {
    override val id = integer("id").entityId()
    val ghostId = integer("ghostId")
    val selfId = integer("selfId")
    override val primaryKey = PrimaryKey(id, name = "\\"Orphan_pkey\\"")
}
`,
    })
    expect(entityFile(plan, orphan)).toStrictEqual({
      fileName: 'OrphanEntity.kt',
      code: `package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class OrphanEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, OrphanEntity>(OrphanTable)

    var ghostId by OrphanTable.ghostId
    var selfId by OrphanTable.selfId
}
`,
    })
  })
})
