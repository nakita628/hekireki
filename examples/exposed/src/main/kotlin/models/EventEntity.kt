package models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityBatchUpdate
import org.jetbrains.exposed.v1.dao.EntityClass
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

/** A DateTime in each of the forms Prisma gives one on PostgreSQL. */
class EventEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, EventEntity>(EventTable)

    var name by EventTable.name

    /** timestamp(3), the column Prisma gives a DateTime */
    var at by EventTable.at
    var endsAt by EventTable.endsAt
    var createdAt by EventTable.createdAt

    /** Two @updatedAt: Prisma Client stamps both */
    var updatedAt by EventTable.updatedAt
    var syncedAt by EventTable.syncedAt

    /** And one in a date column: the UTC date of the stamp */
    var touchedOn by EventTable.touchedOn
    var day by EventTable.day
    var clock by EventTable.clock

    /** time(6): Prisma still writes milliseconds */
    var fineClock by EventTable.fineClock
    var zonedTime by EventTable.zonedTime
    var seconds by EventTable.seconds
    var micros by EventTable.micros
    var zoned by EventTable.zoned
    var zonedFine by EventTable.zonedFine
    var history by EventTable.history
    var zonedList by EventTable.zonedList

    override fun flush(batch: EntityBatchUpdate?): Boolean {
        if (writeValues.isNotEmpty()) {
            if (!isWritten(EventTable.updatedAt)) {
                updatedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS)
            }
            if (!isWritten(EventTable.syncedAt)) {
                syncedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS)
            }
            if (!isWritten(EventTable.touchedOn)) {
                touchedOn = LocalDate.now(ZoneOffset.UTC)
            }
        }
        return super.flush(batch)
    }
}
