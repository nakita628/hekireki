package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class OrderItemEntity(
    id: EntityID<Long>,
) : Entity<Long>(id) {
    companion object : EntityClass<Long, OrderItemEntity>(OrderItemTable)

    var orderId by OrderItemTable.orderId
    var order by OrderEntity referencedOn OrderItemTable.orderId
    var sku by OrderItemTable.sku
    var qty by OrderItemTable.qty
    var price by OrderItemTable.price
}
