package com.example.models

import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Application user. Fully annotated for every validator generator,
 * with a UUIDv7 primary key, enum default, scalar list, @map columns,
 * @updatedAt, and relations of every cardinality.
 */
object UserTable : IdTable<String>("users") {
    /** Primary key (UUIDv7) */
    override val id = text("id").clientDefault { uuidV7().toString() }.entityId()
    /** Unique login email */
    val email = text("email").uniqueIndex("users_email_key")
    /** Display name */
    val name = text("name")
    val role = pgEnum("role", "\"Role\"", Role.entries, Role::dbName).default(Role.VIEWER)
    val interests = array("interests", TextColumnType()).nullable().databaseDefault("'{}'") { emptyList() }
    val createdAt = pgTimestamp("created_at", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    val updatedAt = pgTimestamp("updated_at", 3).clientDefault { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "users_pkey")
}
