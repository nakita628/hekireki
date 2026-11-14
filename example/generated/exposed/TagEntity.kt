package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

/** Implicit many-to-many partner of Post (join table `_PostToTag`). */
class TagEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, TagEntity>(TagTable)

    var label by TagTable.label
    var posts by PostEntity via PostToTagTable
}
