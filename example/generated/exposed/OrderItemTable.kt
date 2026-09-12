package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object OrderItemTable : IdTable<Long>("order_items") {
    override val id = long("id").autoIncrement().entityId()
    val orderId =
        reference(
            "order_id",
            OrderTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "order_items_order_id_fkey",
        )
    val sku = varchar("sku", 32)
    val qty = integer("qty").default(1)
    val price = decimal("price", 12, 2)
    override val primaryKey = PrimaryKey(id, name = "order_items_pkey")

    init {
        uniqueIndex("order_items_order_id_sku_key", orderId, sku)
    }
}
