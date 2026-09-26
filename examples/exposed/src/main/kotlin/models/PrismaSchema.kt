package models

import org.jetbrains.exposed.v1.core.Schema
import org.jetbrains.exposed.v1.core.Table

object PrismaSchema {
    val schemas: List<Schema> = emptyList()
    val enumTypes: List<String> = emptyList()
    val tables: List<Table> = listOf(EventTable, DefaultsTable, ReadingTable)
}
