package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class ProfileEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, ProfileEntity>(ProfileTable)

    var userId by ProfileTable.userId
    var user by UserEntity referencedOn ProfileTable.userId
    var bio by ProfileTable.bio
    var nickname by ProfileTable.nickname
    var age by ProfileTable.age
    var balance by ProfileTable.balance
    var verified by ProfileTable.verified
    var meta by ProfileTable.meta
    var avatar by ProfileTable.avatar
    var lastSeen by ProfileTable.lastSeen
}
