package com.example.models

import io.github.thibaultmeyer.cuid.CUID
import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.json.jsonb
import java.math.BigDecimal

object ProfileTable : IdTable<String>("\"Profile\"") {
    override val id = text("id").clientDefault { CUID.randomCUID2().toString() }.entityId()
    val userId =
        reference(
            "user_id",
            UserTable,
            onDelete = ReferenceOption.CASCADE,
            onUpdate = ReferenceOption.CASCADE,
            fkName = "\"Profile_user_id_fkey\"",
        ).uniqueIndex("\"Profile_user_id_key\"")
    val bio = text("bio").nullable()
    val nickname = varchar("nickname", 64).default("anonymous")
    val age = short("age").nullable()
    val balance = decimal("balance", 10, 2).default(BigDecimal("0"))
    val verified = bool("verified").default(false)
    val meta = jsonb<String>("meta", { it }, { it }).nullable()
    val avatar = binary("avatar").nullable()
    val lastSeen = pgTimestamptz("last_seen", 6).nullable()
    override val primaryKey = PrimaryKey(id, name = "\"Profile_pkey\"")
}
