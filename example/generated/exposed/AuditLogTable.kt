package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.IdTable
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.json.jsonb
import java.util.UUID

object AuditLogTable : IdTable<UUID>("audit_logs") {
    override val id = javaUUID("id").databaseDefault("gen_random_uuid()").entityId()
    val action = text("action")
    val payload = jsonb<String>("payload", { it }, { it }).default("{}")
    val signature = binary("signature").nullable()
    val loggedAt = pgTimestamp("logged_at", 3).databaseDefault("now()")
    override val primaryKey = PrimaryKey(id, name = "audit_logs_pkey")
}
