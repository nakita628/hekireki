package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityBatchUpdate
import org.jetbrains.exposed.v1.dao.EntityClass
import java.time.Instant
import java.time.temporal.ChronoUnit

class UserEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, UserEntity>(UserTable)

    var email by UserTable.email
    var name by UserTable.name
    var role by UserTable.role
    var interests by UserTable.interests
    var createdAt by UserTable.createdAt
    var updatedAt by UserTable.updatedAt
    val profile by ProfileEntity optionalBackReferencedOn ProfileTable.userId
    val posts by PostEntity referrersOn PostTable.authorId
    val comments by CommentEntity optionalReferrersOn CommentTable.authorId
    val orders by OrderEntity referrersOn OrderTable.userId
    val followers by FollowEntity referrersOn FollowTable.followingId
    val following by FollowEntity referrersOn FollowTable.followerId

    override fun flush(batch: EntityBatchUpdate?): Boolean {
        if (writeValues.isNotEmpty()) {
            if (!isWritten(UserTable.updatedAt)) {
                updatedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS)
            }
        }
        return super.flush(batch)
    }
}
