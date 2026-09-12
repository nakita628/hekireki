package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class CategoryEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, CategoryEntity>(CategoryTable)

    var name by CategoryTable.name
    var parentId by CategoryTable.parentId
    var parent by CategoryEntity optionalReferencedOn CategoryTable.parentId
    val children by CategoryEntity optionalReferrersOn CategoryTable.parentId
}
