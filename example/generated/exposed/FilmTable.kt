package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.IdTable

object FilmTable : IdTable<Int>("\"Film\"") {
    override val id = integer("id").autoIncrement().entityId()
    val title = text("title")
    override val primaryKey = PrimaryKey(id, name = "\"Film_pkey\"")
}
