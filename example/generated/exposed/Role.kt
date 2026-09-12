package com.example.models

enum class Role(
    val dbName: String,
) {
    ADMIN("ADMIN"),
    EDITOR("EDITOR"),
    VIEWER("VIEWER"),
}
