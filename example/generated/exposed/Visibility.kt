package com.example.models

enum class Visibility(
    val dbName: String,
) {
    PUBLIC("public"),
    PRIVATE("private"),
    LINK_ONLY("link_only"),
}
