package com.example.models

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.Table

object PostToTagTable : Table("\"_PostToTag\"") {
    val a =
        reference(
            "\"A\"",
            PostTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\"_PostToTag_A_fkey\"",
        )
    val b =
        reference(
            "\"B\"",
            TagTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\"_PostToTag_B_fkey\"",
        )
    override val primaryKey = PrimaryKey(a, b, name = "\"_PostToTag_AB_pkey\"")

    init {
        index("\"_PostToTag_B_index\"", false, b)
    }
}
