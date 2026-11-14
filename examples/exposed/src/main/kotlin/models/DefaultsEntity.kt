package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

/** Literal defaults and now() in every native type: what Prisma Client writes for each. */
class DefaultsEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, DefaultsEntity>(DefaultsTable)

    var epoch by DefaultsTable.epoch

    /** An offset: Prisma Client writes the UTC instant, 03:34:56.789 */
    var shifted by DefaultsTable.shifted

    /** Microseconds: a JavaScript Date keeps the milliseconds, .123 */
    var micro by DefaultsTable.micro
    var zoned by DefaultsTable.zoned

    /** The UTC date of the instant, 2019-12-31 */
    var day by DefaultsTable.day

    /** The UTC time, 00:30:00 */
    var clock by DefaultsTable.clock
    var zonedClock by DefaultsTable.zonedClock
    var stampedOn by DefaultsTable.stampedOn
    var stampedAt by DefaultsTable.stampedAt
    var stampedTz by DefaultsTable.stampedTz
    var zonedNow by DefaultsTable.zonedNow
}
