package models

import org.jetbrains.exposed.v1.core.dao.id.CompositeIdTable

object ReadingTable : CompositeIdTable("\"Reading\"") {
    val sensor = text("sensor").entityId()
    val at = pgTimestamp("at", 3).entityId()
    val value = double("value")
    override val primaryKey = PrimaryKey(sensor, at, name = "\"Reading_pkey\"")
}
