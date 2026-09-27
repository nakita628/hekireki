package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class DefaultsEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, DefaultsEntity>(DefaultsTable)

    var epoch by DefaultsTable.epoch
    var shifted by DefaultsTable.shifted
    var micro by DefaultsTable.micro
    var zoned by DefaultsTable.zoned
    var day by DefaultsTable.day
    var clock by DefaultsTable.clock
    var zonedClock by DefaultsTable.zonedClock
    var stampedOn by DefaultsTable.stampedOn
    var stampedAt by DefaultsTable.stampedAt
    var stampedTz by DefaultsTable.stampedTz
    var zonedNow by DefaultsTable.zonedNow
}
