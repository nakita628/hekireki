package com.example.models

/**
 * Enum with @map on every value and @@map on the enum itself:
 * the database stores the mapped values ("link_only"), while
 * generators receive the Prisma-level names ("LINK_ONLY").
 */
enum class Visibility(
    val dbName: String,
) {
    PUBLIC("public"),
    PRIVATE("private"),
    LINK_ONLY("link_only"),
}
