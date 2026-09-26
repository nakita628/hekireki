package models

import org.jetbrains.exposed.v1.core.dao.id.IdTable
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

object DefaultsTable : IdTable<Int>("\"Defaults\"") {
    override val id = integer("id").autoIncrement().entityId()
    val epoch = pgTimestamp("epoch", 3).default(Instant.parse("2020-01-01T00:00:00Z"))
    val shifted =
        pgTimestamp("shifted", 3).databaseDefault("'2020-01-01 12:34:56.789 +09:00'") { Instant.parse("2020-01-01T03:34:56.789Z") }
    val micro = pgTimestamp("micro", 6).default(Instant.parse("2020-01-01T00:00:00.123456Z"))
    val zoned = pgTimestamptz("zoned", 6).default(Instant.parse("2020-01-01T03:34:56.789Z"))
    val day = pgDate("day").databaseDefault("'2020-01-01 01:00:00 +09:00'") { LocalDate.parse("2019-12-31") }
    val clock = pgTime("clock", 3).databaseDefault("'2020-01-01 09:30:00 +09:00'") { LocalTime.parse("00:30:00") }
    val zonedClock = pgTimetz("zoned_clock", 3).databaseDefault("'2020-01-01 09:30:00.500 +09:00'") { OffsetTime.parse("00:30:00.5Z") }
    val stampedOn = pgDate("stamped_on").databaseDefault("CURRENT_TIMESTAMP") { LocalDate.now(ZoneOffset.UTC) }
    val stampedAt =
        pgTime("stamped_at", 3).databaseDefault("CURRENT_TIMESTAMP") { LocalTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS) }
    val stampedTz =
        pgTimetz("stamped_tz", 3).databaseDefault("CURRENT_TIMESTAMP") { OffsetTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS) }
    val zonedNow = pgTimestamptz("zoned_now", 3).databaseDefault("CURRENT_TIMESTAMP") { Instant.now().truncatedTo(ChronoUnit.MILLIS) }
    override val primaryKey = PrimaryKey(id, name = "\"Defaults_pkey\"")
}
