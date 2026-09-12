package com.example.models

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
    val follower by UserEntity referencedOn FollowTable.followerId
    val following by UserEntity referencedOn FollowTable.followingId
    var since by FollowTable.since
}
