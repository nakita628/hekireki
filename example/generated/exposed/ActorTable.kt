package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

/**
 * Named implicit many-to-many: the join table is `_cast`,
 * not `_ActorToFilm`.
 */
object ActorTable : IdTable<Int>("\"Actor\"") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("name")
    override val primaryKey = PrimaryKey(id, name = "\"Actor_pkey\"")
}
