package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

object PostTable : IdTable<String>("posts") {
    override val id = text("id").clientDefault { UUID.randomUUID().toString() }.entityId()
    val title = text("title")
    val content = text("content").nullable()
    val visibility = pgEnum("visibility", "\"visibility_level\"", Visibility.entries, Visibility::dbName).default(Visibility.LINK_ONLY)
    val published = bool("published").default(false)
    val viewCount = integer("view_count").default(0)
    val authorId =
        reference(
            "author_id",
            UserTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "posts_author_id_fkey",
        )
    val createdAt = pgTimestamp("created_at", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "posts_pkey")

    init {
        index("posts_author_id_idx", false, authorId)
    }
}
