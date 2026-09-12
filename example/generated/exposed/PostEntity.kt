package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class PostEntity(
    id: EntityID<String>,
) : Entity<String>(id) {
    companion object : EntityClass<String, PostEntity>(PostTable)

    var title by PostTable.title
    var content by PostTable.content
    var visibility by PostTable.visibility
    var published by PostTable.published
    var viewCount by PostTable.viewCount
    var authorId by PostTable.authorId
    var author by UserEntity referencedOn PostTable.authorId
    var tags by TagEntity via PostToTagTable
    val comments by CommentEntity referrersOn CommentTable.postId
    var createdAt by PostTable.createdAt
}
