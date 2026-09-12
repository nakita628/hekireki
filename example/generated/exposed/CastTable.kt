package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.Table

object CastTable : Table("_cast") {
    val a =
        reference("\"A\"", ActorTable, onDelete = ReferenceOption.CASCADE, onUpdate = ReferenceOption.CASCADE, fkName = "\"_cast_A_fkey\"")
    val b =
        reference("\"B\"", FilmTable, onDelete = ReferenceOption.CASCADE, onUpdate = ReferenceOption.CASCADE, fkName = "\"_cast_B_fkey\"")
    override val primaryKey = PrimaryKey(a, b, name = "\"_cast_AB_pkey\"")

    init {
        index("\"_cast_B_index\"", false, b)
    }
}
