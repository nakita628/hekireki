package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass
import java.util.UUID

class AuditLogEntity(
    id: EntityID<UUID>,
) : Entity<UUID>(id) {
    companion object : EntityClass<UUID, AuditLogEntity>(AuditLogTable)

    var action by AuditLogTable.action
    var payload by AuditLogTable.payload
    var signature by AuditLogTable.signature
    var loggedAt by AuditLogTable.loggedAt
}
