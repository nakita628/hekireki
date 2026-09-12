package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.temporal.ChronoUnit

object OrderTable : IdTable<Long>("orders") {
    override val id = long("id").autoIncrement().entityId()
    val userId =
        reference(
            "user_id",
            UserTable,
            onDelete = ReferenceOption.RESTRICT,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "orders_user_id_fkey",
        )
    val total = decimal("total", 12, 2)
    val placedAt = pgTimestamp("placed_at", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "orders_pkey")
}
