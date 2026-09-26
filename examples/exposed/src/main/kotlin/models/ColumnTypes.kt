package models

import org.jetbrains.exposed.v1.core.ArrayColumnType
import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.ColumnType
import org.jetbrains.exposed.v1.core.Function
import org.jetbrains.exposed.v1.core.IColumnType
import org.jetbrains.exposed.v1.core.QueryBuilder
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.statements.api.PreparedStatementApi
import org.jetbrains.exposed.v1.core.statements.api.RowApi
import org.jetbrains.exposed.v1.dao.Entity
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.OffsetTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.sql.Array as SqlArray

internal class SqlExpression<T>(
    private val sql: String,
    columnType: IColumnType<T & Any>,
) : Function<T>(columnType) {
    override fun toQueryBuilder(queryBuilder: QueryBuilder) {
        queryBuilder.append(sql)
    }
}

internal fun <T> Column<T>.databaseDefault(
    sql: String,
    value: (() -> T)? = null,
): Column<T> =
    with(table) {
        if (value == null) defaultExpression(SqlExpression(sql, columnType)) else clientDefault(value).withDefinition("DEFAULT $sql")
    }

internal class PgTimestampColumnType(
    val precision: Int? = null,
) : ColumnType<Instant>() {
    override fun sqlType(): String = if (precision == null) "TIMESTAMP" else "TIMESTAMP($precision)"

    override fun valueFromDB(value: Any): Instant =
        when (value) {
            is Instant -> value
            is LocalDateTime -> value.toInstant(ZoneOffset.UTC)
            else -> error("Unexpected value of type ${value::class.qualifiedName}: $value")
        }.truncatedTo(ChronoUnit.MILLIS)

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, LocalDateTime::class.java)

    override fun notNullValueToDB(value: Instant): Any = LocalDateTime.ofInstant(value.truncatedTo(ChronoUnit.MILLIS), ZoneOffset.UTC)

    override fun nonNullValueToString(value: Instant): String = "'${notNullValueToDB(value)}'"
}

internal fun Table.pgTimestamp(
    name: String,
    precision: Int? = null,
): Column<Instant> = registerColumn(name, PgTimestampColumnType(precision))

internal class PgTimestamptzColumnType(
    val precision: Int? = null,
) : ColumnType<Instant>() {
    override fun sqlType(): String = if (precision == null) "TIMESTAMPTZ" else "TIMESTAMPTZ($precision)"

    override fun valueFromDB(value: Any): Instant =
        when (value) {
            is Instant -> value
            is OffsetDateTime -> value.toInstant()
            else -> error("Unexpected value of type ${value::class.qualifiedName}: $value")
        }.truncatedTo(ChronoUnit.MILLIS)

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, OffsetDateTime::class.java)

    override fun notNullValueToDB(value: Instant): Any = value.truncatedTo(ChronoUnit.MILLIS).atOffset(ZoneOffset.UTC)

    override fun nonNullValueToString(value: Instant): String = "'${notNullValueToDB(value)}'"
}

internal fun Table.pgTimestamptz(
    name: String,
    precision: Int? = null,
): Column<Instant> = registerColumn(name, PgTimestamptzColumnType(precision))

internal class PgDateColumnType : ColumnType<LocalDate>() {
    override fun sqlType(): String = "DATE"

    override fun valueFromDB(value: Any): LocalDate =
        when (value) {
            is LocalDate -> value
            else -> error("Unexpected value of type ${value::class.qualifiedName}: $value")
        }

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, LocalDate::class.java)

    override fun nonNullValueToString(value: LocalDate): String = "'$value'"
}

internal fun Table.pgDate(name: String): Column<LocalDate> = registerColumn(name, PgDateColumnType())

internal class PgTimeColumnType(
    val precision: Int? = null,
) : ColumnType<LocalTime>() {
    override fun sqlType(): String = if (precision == null) "TIME" else "TIME($precision)"

    override fun valueFromDB(value: Any): LocalTime =
        when (value) {
            is LocalTime -> value
            else -> error("Unexpected value of type ${value::class.qualifiedName}: $value")
        }.truncatedTo(ChronoUnit.MILLIS)

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, LocalTime::class.java)

    override fun notNullValueToDB(value: LocalTime): Any = value.truncatedTo(ChronoUnit.MILLIS)

    override fun nonNullValueToString(value: LocalTime): String = "'${notNullValueToDB(value)}'"
}

internal fun Table.pgTime(
    name: String,
    precision: Int? = null,
): Column<LocalTime> = registerColumn(name, PgTimeColumnType(precision))

internal class PgTimetzColumnType(
    val precision: Int? = null,
) : ColumnType<OffsetTime>() {
    override fun sqlType(): String = if (precision == null) "TIMETZ" else "TIMETZ($precision)"

    override fun valueFromDB(value: Any): OffsetTime =
        when (value) {
            is OffsetTime -> value
            else -> error("Unexpected value of type ${value::class.qualifiedName}: $value")
        }.withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)

    override fun readObject(
        rs: RowApi,
        index: Int,
    ): Any? = rs.getObject(index, OffsetTime::class.java)

    override fun notNullValueToDB(value: OffsetTime): Any = value.withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)

    override fun nonNullValueToString(value: OffsetTime): String = "'${notNullValueToDB(value)}'"
}

internal fun Table.pgTimetz(
    name: String,
    precision: Int? = null,
): Column<OffsetTime> = registerColumn(name, PgTimetzColumnType(precision))

internal class PgListColumnType<T : Any>(
    val element: ColumnType<T>,
    val elementClass: Class<*>,
) : ColumnType<List<T>>() {
    private val array = ArrayColumnType<T, List<T>>(element)

    override fun sqlType(): String = array.sqlType()

    override fun valueFromDB(value: Any): List<T> =
        when (value) {
            is SqlArray -> {
                value.resultSet.use { rows ->
                    buildList {
                        while (rows.next()) add(elementFromDB(read(rows)))
                    }
                }
            }

            is List<*> -> {
                value.map(::elementFromDB)
            }

            is Array<*> -> {
                value.map(::elementFromDB)
            }

            else -> {
                error("Unexpected value of type ${value::class.qualifiedName}: $value")
            }
        }

    private fun elementFromDB(value: Any?): T = value?.let(element::valueFromDB) ?: error("NULL in a list of ${element.sqlType()}")

    private fun read(rows: ResultSet): Any? = if (elementClass == String::class.java) rows.getString(2) else rows.getObject(2, elementClass)

    override fun notNullValueToDB(value: List<T>): Any = array.notNullValueToDB(value)

    override fun nonNullValueToString(value: List<T>): String = array.nonNullValueToString(value)

    override fun nonNullValueAsDefaultString(value: List<T>): String = array.nonNullValueAsDefaultString(value)

    override fun setParameter(
        stmt: PreparedStatementApi,
        index: Int,
        value: Any?,
    ) {
        array.setParameter(stmt, index, value)
    }
}

internal fun <T : Any> Table.pgList(
    name: String,
    element: ColumnType<T>,
    elementClass: Class<*>,
): Column<List<T>> = registerColumn(name, PgListColumnType(element, elementClass))

internal fun Entity<*>.isWritten(column: Column<*>): Boolean = writeValues.keys.any { it == column }
