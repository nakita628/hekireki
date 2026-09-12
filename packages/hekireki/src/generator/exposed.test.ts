import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { exposedFiles } from './exposed.js'

const SCHEMA = `datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  MEMBER
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  role  Role   @default(MEMBER)
  posts Post[]
}

model Post {
  id       Int   @id @default(autoincrement())
  authorId Int
  author   User  @relation(fields: [authorId], references: [id])
  tags     Tag[]
}

model Tag {
  name  String @id
  posts Post[]
}
`

describe('exposedFiles', () => {
  it('writes the tables, the entities, the join tables, the enums, the column types they use and PrismaSchema', () => {
    const result = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
    if ('type' in result) throw new Error(result.error.message)
    expect(
      exposedFiles(result.datamodel, { package: 'com.example.db', dao: true, source: SCHEMA }),
    ).toStrictEqual([
      {
        fileName: 'UserTable.kt',
        code: `package com.example.db

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object UserTable : IdTable<Int>("\\"User\\"") {
    override val id = integer("id").autoIncrement().entityId()
    val email = text("email").uniqueIndex("\\"User_email_key\\"")
    val role = pgEnum("role", "\\"Role\\"", Role.entries, Role::dbName).default(Role.MEMBER)
    override val primaryKey = PrimaryKey(id, name = "\\"User_pkey\\"")
}
`,
      },
      {
        fileName: 'PostTable.kt',
        code: `package com.example.db

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
      },
      {
        fileName: 'TagTable.kt',
        code: `package com.example.db

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object TagTable : IdTable<String>("\\"Tag\\"") {
    override val id = text("name").entityId()
    override val primaryKey = PrimaryKey(id, name = "\\"Tag_pkey\\"")
}
`,
      },
      {
        fileName: 'UserEntity.kt',
        code: `package com.example.db

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class UserEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, UserEntity>(UserTable)

    var email by UserTable.email
    var role by UserTable.role
    val posts by PostEntity referrersOn PostTable.authorId
}
`,
      },
      {
        fileName: 'PostEntity.kt',
        code: `package com.example.db

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PostEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, PostEntity>(PostTable)

    var authorId by PostTable.authorId
    var author by UserEntity referencedOn PostTable.authorId
    var tags by TagEntity via PostToTagTable
}
`,
      },
      {
        fileName: 'TagEntity.kt',
        code: `package com.example.db

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
      },
      {
        fileName: 'PostToTagTable.kt',
        code: `package com.example.db

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
      },
      {
        fileName: 'Role.kt',
        code: `package com.example.db

enum class Role(
    val dbName: String,
) {
    ADMIN("ADMIN"),
    MEMBER("MEMBER"),
}
`,
      },
      {
        fileName: 'ColumnTypes.kt',
        code: `package com.example.db

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
      },
      {
        fileName: 'PrismaSchema.kt',
        code: `package com.example.db

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = emptyList()
    val enumTypes: List<String> = listOf("CREATE TYPE \\"Role\\" AS ENUM ('ADMIN', 'MEMBER')")
    val tables: List<Table> = listOf(UserTable, PostTable, TagTable, PostToTagTable)
}
`,
      },
    ])
  })

  it('leaves the entities out when dao is off', () => {
    const result = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
    if ('type' in result) throw new Error(result.error.message)
    expect(
      exposedFiles(result.datamodel, { package: 'models', dao: false, source: SCHEMA }).map(
        (file) => file.fileName,
      ),
    ).toStrictEqual([
      'UserTable.kt',
      'PostTable.kt',
      'TagTable.kt',
      'PostToTagTable.kt',
      'Role.kt',
      'ColumnTypes.kt',
      'PrismaSchema.kt',
    ])
  })

  it('writes no support file when no column needs one', () => {
    const schema =
      'datasource db {\n  provider = "postgresql"\n}\n\nmodel Tag {\n  name String @id\n}\n'
    const result = getDMMF({ datamodel: [['schema.prisma', schema]] })
    if ('type' in result) throw new Error(result.error.message)
    expect(
      exposedFiles(result.datamodel, { package: 'models', dao: true, source: schema }).map(
        (file) => file.fileName,
      ),
    ).toStrictEqual(['TagTable.kt', 'TagEntity.kt', 'PrismaSchema.kt'])
  })
})
