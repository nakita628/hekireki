package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

object EventTable : IdTable<Int>("\"Event\"") {
    override val id = integer("id").autoIncrement().entityId()
    val name = text("name").uniqueIndex("\"Event_name_key\"")
    val at = pgTimestamp("at", 3)
    val endsAt = pgTimestamp("ends_at", 3).nullable()
    val createdAt = pgTimestamp("created_at", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    val updatedAt = pgTimestamp("updated_at", 3).clientDefault { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    val syncedAt = pgTimestamp("synced_at", 3).clientDefault { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    val touchedOn = pgDate("touched_on").clientDefault { LocalDate.now(ZoneOffset.UTC) }
    val day = pgDate("day")
    val clock = pgTime("clock", 3)
    val fineClock = pgTime("fine_clock")
    val zonedTime = pgTimetz("zoned_time", 3)
    val seconds = pgTimestamp("seconds", 0)
    val micros = pgTimestamp("micros", 6)
    val zoned = pgTimestamptz("zoned", 3)
    val zonedFine = pgTimestamptz("zoned_fine", 6)
    val history = pgList("history", PgTimestampColumnType(3), LocalDateTime::class.java).nullable()
    val zonedList = pgList("zoned_list", PgTimestamptzColumnType(6), OffsetDateTime::class.java).nullable()
    override val primaryKey = PrimaryKey(id, name = "\"Event_pkey\"")
}
