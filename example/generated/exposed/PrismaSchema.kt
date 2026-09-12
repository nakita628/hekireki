package com.example.models

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = emptyList()
    val enumTypes: List<String> =
        listOf(
            "CREATE TYPE \"Role\" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER')",
            "CREATE TYPE \"visibility_level\" AS ENUM ('public', 'private', 'link_only')",
        )
    val tables: List<Table> =
        listOf(
            UserTable,
            ProfileTable,
            PostTable,
            TagTable,
            CommentTable,
            FollowTable,
            CategoryTable,
            OrderTable,
            OrderItemTable,
            AuditLogTable,
            ActorTable,
            FilmTable,
            PostToTagTable,
            CastTable,
        )
}
