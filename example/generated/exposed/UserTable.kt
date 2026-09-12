package com.example.models

import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.temporal.ChronoUnit

object UserTable : IdTable<String>("users") {
    override val id = text("id").clientDefault { uuidV7().toString() }.entityId()
    val email = text("email").uniqueIndex("users_email_key")
    val name = text("name")
    val role = pgEnum("role", "\"Role\"", Role.entries, Role::dbName).default(Role.VIEWER)
    val interests = array("interests", TextColumnType()).nullable().databaseDefault("'{}'") { emptyList() }
    val createdAt = pgTimestamp("created_at", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    val updatedAt = pgTimestamp("updated_at", 3).clientDefault { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "users_pkey")
}
