package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object TagTable : IdTable<Int>("\"Tag\"") {
    override val id = integer("id").autoIncrement().entityId()
    val label = text("label").uniqueIndex("\"Tag_label_key\"")
    override val primaryKey = PrimaryKey(id, name = "\"Tag_pkey\"")
}
