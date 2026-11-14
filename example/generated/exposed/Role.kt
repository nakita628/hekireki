package com.example.models

/** User role. No @map: the value names are stored verbatim. */
enum class Role(
    val dbName: String,
) {
    ADMIN("ADMIN"),
    EDITOR("EDITOR"),
    VIEWER("VIEWER"),
}
