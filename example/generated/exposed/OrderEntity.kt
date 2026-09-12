package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class OrderEntity(
    id: EntityID<Long>,
) : Entity<Long>(id) {
    companion object : EntityClass<Long, OrderEntity>(OrderTable)

    var userId by OrderTable.userId
    var user by UserEntity referencedOn OrderTable.userId
    var total by OrderTable.total
    var placedAt by OrderTable.placedAt
    val items by OrderItemEntity referrersOn OrderItemTable.orderId
}
