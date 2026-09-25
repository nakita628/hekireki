import models.DefaultsEntity
import models.DefaultsTable
import models.EventEntity
import models.EventTable
import models.ReadingEntity
import models.ReadingTable
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.between
import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.lessEq
import org.jetbrains.exposed.v1.core.statements.StatementType
import org.jetbrains.exposed.v1.dao.flushCache
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.jdbc.JdbcTransaction
import org.jetbrains.exposed.v1.jdbc.deleteAll
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

// Runs the generated tables and entities against the database `prisma db push` made, and checks
// every value against what Prisma Client writes for it, read back with SQL rather than through
// Exposed. run.ts starts it with the JVM in UTC and in Asia/Tokyo, so that anything converted
// through the JVM's zone shows. `check` is Exposed alone; `seed` writes the rows interop.ts reads
// through Prisma Client, and `read` reads the rows interop.ts wrote. Each check prints
// `ok: <name>`, or stops with what it saw.

fun check(
    name: String,
    vararg problems: Pair<Any?, Any?>,
) {
    val wrong = problems.filter { (got, want) -> got != want }
    if (wrong.isNotEmpty()) {
        throw IllegalStateException("$name: " + wrong.joinToString { (got, want) -> "expected $want, got $got" })
    }
    println("ok: $name")
}

fun JdbcTransaction.text(sql: String): String? =
    exec(sql, explicitStatementType = StatementType.SELECT) { rs -> if (rs.next()) rs.getString(1) else null }

// An instant with nanoseconds, as Instant.now() and a parsed timestamp can hold: Prisma Client has
// only the milliseconds of a JavaScript Date, 09:00:00.123, where PostgreSQL would round the rest
// to 09:00:00.124 in a timestamp(3) and keep 09:00:00.123457 in a timestamp(6).
val FINE: Instant = Instant.parse("2030-01-01T09:00:00.123999999Z")
val MILLIS: Instant = Instant.parse("2030-01-01T09:00:00.123Z")

// What each column holds, as `::text` prints it, for the values below. A timestamptz is printed in
// UTC and a timetz with the offset it keeps: Prisma Client writes the UTC clock.
const val COLUMNS =
    "at::text, micros::text, seconds::text, (zoned AT TIME ZONE 'UTC')::text, " +
        "(zoned_fine AT TIME ZONE 'UTC')::text, day::text, clock::text, fine_clock::text, zoned_time::text, " +
        "history::text, (SELECT string_agg((z AT TIME ZONE 'UTC')::text, ',') FROM unnest(zoned_list) z)"

val STORED =
    listOf(
        "2030-01-01 09:00:00.123",
        "2030-01-01 09:00:00.123",
        // timestamp(0): PostgreSQL rounds Prisma's milliseconds too.
        "2030-01-01 09:00:00",
        "2030-01-01 09:00:00.123",
        "2030-01-01 09:00:00.123",
        "2030-01-01",
        "09:00:00.123",
        "09:00:00.123",
        "09:00:00.123+00",
        "{\"2030-01-01 09:00:00.123\",\"1999-12-31 23:59:59.999\"}",
        "2030-01-01 09:00:00.123,1999-12-31 23:59:59.999",
    ).joinToString("|")

fun JdbcTransaction.stored(
    table: String,
    where: String,
): String? = text("SELECT concat_ws('|', $COLUMNS) FROM \"$table\" WHERE $where")

fun EventEntity.fill() {
    at = FINE
    micros = FINE
    seconds = FINE
    zoned = FINE
    zonedFine = FINE
    day = LocalDate.parse("2030-01-01")
    clock = LocalTime.parse("09:00:00.123999999")
    fineClock = LocalTime.parse("09:00:00.123999999")
    // The same instant as 09:00:00.123 UTC, given in Tokyo's offset.
    zonedTime = OffsetTime.parse("18:00:00.123999999+09:00")
    history = listOf(FINE, Instant.parse("1999-12-31T23:59:59.999999Z"))
    zonedList = listOf(FINE, Instant.parse("1999-12-31T23:59:59.999999Z"))
}

fun exposedAlone(db: Database) {
    transaction(db) {
        EventTable.deleteAll()
        DefaultsTable.deleteAll()
        ReadingTable.deleteAll()
    }

    val event =
        transaction(db) {
            EventEntity.new {
                name = "fine"
                fill()
            }
        }
    transaction(db) {
        check(
            "a DateTime is written as Prisma Client writes it: the UTC clock, to the millisecond, in every native type",
            stored("Event", "name = 'fine'") to STORED,
        )
    }

    transaction(db) {
        val read = EventEntity.find { EventTable.name eq "fine" }.single()
        check(
            "and read back as the same instants",
            read.at to MILLIS,
            read.micros to MILLIS,
            read.seconds to Instant.parse("2030-01-01T09:00:00Z"),
            read.zoned to MILLIS,
            read.zonedFine to MILLIS,
            read.day to LocalDate.parse("2030-01-01"),
            read.clock to LocalTime.parse("09:00:00.123"),
            read.fineClock to LocalTime.parse("09:00:00.123"),
            read.zonedTime to OffsetTime.parse("09:00:00.123Z"),
            read.history to listOf(MILLIS, Instant.parse("1999-12-31T23:59:59.999Z")),
            read.zonedList to listOf(MILLIS, Instant.parse("1999-12-31T23:59:59.999Z")),
        )
    }

    transaction(db) {
        fun found(op: () -> org.jetbrains.exposed.v1.core.Op<Boolean>) = EventTable.selectAll().where(op).map { it[EventTable.name] }
        check(
            "a query binds a DateTime as the column writes it, so the value it was written from finds the row",
            found { EventTable.at eq FINE } to listOf("fine"),
            found { EventTable.micros eq FINE } to listOf("fine"),
            found { EventTable.zoned eq FINE } to listOf("fine"),
            found { EventTable.zonedFine eq FINE } to listOf("fine"),
            found { EventTable.clock eq LocalTime.parse("09:00:00.123999999") } to listOf("fine"),
            found { EventTable.fineClock eq LocalTime.parse("09:00:00.123999999") } to listOf("fine"),
            found { EventTable.zonedTime eq OffsetTime.parse("18:00:00.123999999+09:00") } to listOf("fine"),
            found { EventTable.at.between(FINE, FINE) } to listOf("fine"),
            found { (EventTable.micros lessEq FINE) and (EventTable.micros greaterEq FINE) } to listOf("fine"),
        )
    }

    transaction(db) {
        val row = EventEntity.find { EventTable.name eq "fine" }.single()
        val createdAt = row.createdAt
        val stamps = listOf(row.updatedAt, row.syncedAt)
        check(
            "now() and every @updatedAt are stamped by the client on create, to the millisecond, the date one in UTC",
            stamps.all { it.nano % 1_000_000 == 0 } to true,
            (createdAt.nano % 1_000_000 == 0) to true,
            (Instant.now().minusSeconds(60) < createdAt && createdAt <= Instant.now()) to true,
            row.touchedOn to LocalDate.ofInstant(row.updatedAt, ZoneOffset.UTC),
            text("SELECT (extract(epoch FROM created_at) * 1000)::bigint FROM \"Event\" WHERE name = 'fine'") to
                createdAt.toEpochMilli().toString(),
        )
    }

    Thread.sleep(5)
    transaction(db) {
        val row = EventEntity.find { EventTable.name eq "fine" }.single()
        val before = row.updatedAt
        row.endsAt = FINE
        flushCache()
        check(
            "an update through the DAO stamps every @updatedAt again",
            (row.updatedAt > before) to true,
            (row.syncedAt > before) to true,
            text("SELECT (extract(epoch FROM updated_at) * 1000)::bigint FROM \"Event\" WHERE name = 'fine'") to
                row.updatedAt.toEpochMilli().toString(),
            text("SELECT ends_at::text FROM \"Event\" WHERE name = 'fine'") to "2030-01-01 09:00:00.123",
        )
        val pinned = Instant.parse("2000-01-01T00:00:00Z")
        row.updatedAt = pinned
        row.name = "fine, pinned"
        flushCache()
        check(
            "an @updatedAt the update sets is kept, the others stamped",
            text("SELECT updated_at::text FROM \"Event\" WHERE id = ${row.id.value}") to "2000-01-01 00:00:00",
            (row.syncedAt > before) to true,
        )
    }

    transaction(db) {
        EventTable.insert {
            it[name] = "dsl"
            it[at] = FINE
            it[micros] = FINE
            it[seconds] = FINE
            it[zoned] = FINE
            it[zonedFine] = FINE
            it[day] = LocalDate.parse("2030-01-01")
            it[clock] = LocalTime.parse("09:00:00.123999999")
            it[fineClock] = LocalTime.parse("09:00:00.123999999")
            it[zonedTime] = OffsetTime.parse("18:00:00.123999999+09:00")
            it[history] = listOf(FINE, Instant.parse("1999-12-31T23:59:59.999999Z"))
            it[zonedList] = listOf(FINE, Instant.parse("1999-12-31T23:59:59.999999Z"))
        }
        check(
            "the DSL's insert writes the same, and fills now() and each @updatedAt",
            stored("Event", "name = 'dsl'") to STORED,
            text("SELECT created_at IS NOT NULL AND updated_at IS NOT NULL AND synced_at IS NOT NULL FROM \"Event\" WHERE name = 'dsl'") to "t",
        )
        EventTable.update({ EventTable.name eq "dsl" }) {
            it[at] = Instant.parse("2031-06-30T23:59:59.999999Z")
            it[zonedTime] = OffsetTime.parse("08:59:59.999999-15:00")
        }
        check(
            "and its update binds the same",
            text("SELECT at::text || ' ' || zoned_time::text FROM \"Event\" WHERE name = 'dsl'") to
                "2031-06-30 23:59:59.999 23:59:59.999+00",
        )
    }

    transaction(db) {
        val defaults = DefaultsEntity.new {}
        flushCache()
        val id = defaults.id.value
        check(
            "literal defaults are what Prisma Client writes for them: the UTC instant, to the millisecond",
            text(
                "SELECT concat_ws('|', epoch::text, shifted::text, micro::text, (zoned AT TIME ZONE 'UTC')::text, day::text, " +
                    "clock::text, zoned_clock::text) FROM \"Defaults\" WHERE id = $id",
            ) to
                "2020-01-01 00:00:00|2020-01-01 03:34:56.789|2020-01-01 00:00:00.123|2020-01-01 03:34:56.789|2019-12-31|" +
                "00:30:00|00:30:00.5+00",
            defaults.micro to Instant.parse("2020-01-01T00:00:00.123Z"),
            defaults.zonedClock to OffsetTime.parse("00:30:00.5Z"),
        )
        val now = Instant.now()
        check(
            "now() in a date, a time, a timetz and a timestamptz column is the UTC date and clock",
            defaults.stampedOn to LocalDate.ofInstant(defaults.zonedNow, ZoneOffset.UTC),
            (defaults.stampedAt.nano % 1_000_000 == 0) to true,
            (defaults.stampedTz.offset == ZoneOffset.UTC) to true,
            (now.minusSeconds(60) < defaults.zonedNow && defaults.zonedNow <= now) to true,
            text("SELECT abs(extract(epoch FROM stamped_at - (now() AT TIME ZONE 'UTC')::time)) < 60 FROM \"Defaults\" WHERE id = $id") to "t",
        )
    }

    transaction(db) {
        ReadingEntity.new(
            CompositeID {
                it[ReadingTable.sensor] = "north"
                it[ReadingTable.at] = FINE
            },
        ) { value = 1.5 }
    }
    transaction(db) {
        val key =
            CompositeID {
                it[ReadingTable.sensor] = "north"
                it[ReadingTable.at] = FINE
            }
        check(
            "a DateTime in a composite key is found by the value it was written from",
            ReadingEntity.findById(key)?.value to 1.5,
            text("SELECT at::text FROM \"Reading\" WHERE sensor = 'north'") to "2030-01-01 09:00:00.123",
        )
    }
}

// The rows interop.ts reads through Prisma Client.
fun seed(db: Database) {
    transaction(db) {
        EventTable.deleteAll()
        DefaultsTable.deleteAll()
        ReadingTable.deleteAll()
        EventEntity.new {
            name = "exposed"
            fill()
        }
        DefaultsEntity.new {}
        ReadingEntity.new(
            CompositeID {
                it[ReadingTable.sensor] = "exposed"
                it[ReadingTable.at] = FINE
            },
        ) { value = 2.5 }
    }
    println("ok: Exposed wrote the rows for Prisma Client")
}

// The rows interop.ts wrote with Prisma Client, from the instant 2030-01-01T09:00:00.123Z.
fun read(db: Database) {
    transaction(db) {
        val event = EventEntity.find { EventTable.name eq "prisma" }.single()
        check(
            "Exposed reads each DateTime Prisma Client wrote as the instant it was",
            event.at to MILLIS,
            event.micros to MILLIS,
            event.seconds to Instant.parse("2030-01-01T09:00:00Z"),
            event.zoned to MILLIS,
            event.zonedFine to MILLIS,
            event.day to LocalDate.parse("2030-01-01"),
            event.clock to LocalTime.parse("09:00:00.123"),
            event.fineClock to LocalTime.parse("09:00:00.123"),
            event.zonedTime to OffsetTime.parse("09:00:00.123Z"),
            event.history to listOf(MILLIS, Instant.parse("1999-12-31T23:59:59.999Z")),
            event.zonedList to listOf(MILLIS, Instant.parse("1999-12-31T23:59:59.999Z")),
            (event.updatedAt == event.syncedAt) to true,
        )
        fun found(op: () -> org.jetbrains.exposed.v1.core.Op<Boolean>) = EventTable.selectAll().where(op).map { it[EventTable.name] }
        check(
            "and finds Prisma Client's row by each of them, given with nanoseconds or in another offset",
            found { EventTable.at eq FINE } to listOf("prisma"),
            found { EventTable.micros eq FINE } to listOf("prisma"),
            found { EventTable.zoned eq FINE } to listOf("prisma"),
            found { EventTable.zonedFine eq FINE } to listOf("prisma"),
            found { EventTable.clock eq LocalTime.parse("09:00:00.123999999") } to listOf("prisma"),
            found { EventTable.fineClock eq LocalTime.parse("09:00:00.123999999") } to listOf("prisma"),
            found { EventTable.zonedTime eq OffsetTime.parse("18:00:00.123999999+09:00") } to listOf("prisma"),
            found { EventTable.createdAt eq event.createdAt } to listOf("prisma"),
        )
        val key =
            CompositeID {
                it[ReadingTable.sensor] = "prisma"
                it[ReadingTable.at] = FINE
            }
        check("and Prisma Client's reading by its composite key", ReadingEntity.findById(key)?.value to 3.5)
        val defaults = DefaultsEntity.all().toList()
        check(
            "a row of Prisma Client's defaults and one of Exposed's hold the same literal values",
            defaults.map { listOf(it.epoch, it.shifted, it.micro, it.zoned, it.day, it.clock, it.zonedClock) }.distinct().size to 1,
            defaults.size to 2,
        )
    }
}

fun main(args: Array<String>) {
    val (mode, url) = args
    val db = Database.connect(url)
    println("JVM zone ${ZoneId.systemDefault()}, $mode")
    when (mode) {
        "check" -> exposedAlone(db)
        "seed" -> seed(db)
        "read" -> read(db)
        else -> error("mode: check, seed or read")
    }
}
