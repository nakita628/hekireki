package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object ActorTable : IdTable<Int>("\"Actor\"") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("name")
    override val primaryKey = PrimaryKey(id, name = "\"Actor_pkey\"")
}
