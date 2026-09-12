package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.temporal.ChronoUnit

object CommentTable : IdTable<Int>("comments") {
    override val id = integer("id").autoIncrement().entityId()
    val body = text("body")
    val postId =
        reference(
            "post_id",
            PostTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "comments_post_id_fkey",
        )
    val authorId =
        optReference(
            "author_id",
            UserTable,
            onDelete = ReferenceOption.SET_NULL,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "comments_author_id_fkey",
        )
    val createdAt = pgTimestamp("created_at", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "comments_pkey")

    init {
        index("comments_post_id_created_at_idx", false, postId, createdAt)
    }
}
