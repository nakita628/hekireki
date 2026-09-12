package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.CompositeIdTable
import java.time.Instant
import java.time.temporal.ChronoUnit

object FollowTable : CompositeIdTable("follows") {
    val followerId =
        reference(
            "follower_id",
            UserTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "follows_follower_id_fkey",
        )
    val followingId =
        reference(
            "following_id",
            UserTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "follows_following_id_fkey",
        )
    val since = pgTimestamp("since", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(followerId, followingId, name = "follows_pkey")

    init {
        addIdColumn(followerId)
        addIdColumn(followingId)
    }
}
