package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

/**
 * Named implicit many-to-many: the join table is `_cast`,
 * not `_ActorToFilm`.
 */
class ActorEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, ActorEntity>(ActorTable)

    var name by ActorTable.name
    var films by FilmEntity via CastTable
}
