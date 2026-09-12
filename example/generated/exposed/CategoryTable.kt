package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable

object CategoryTable : IdTable<Int>("\"Category\"") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("name")
    val parentId =
        optReference(
            "parent_id",
            CategoryTable,
            onDelete = ReferenceOption.SET_NULL,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\"Category_parent_id_fkey\"",
        )
    override val primaryKey = PrimaryKey(id, name = "\"Category_pkey\"")

    init {
        uniqueIndex("\"Category_parent_id_name_key\"", parentId, name)
    }
}
