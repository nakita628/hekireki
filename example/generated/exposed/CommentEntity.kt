package com.example.models

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.Entity
import org.jetbrains.exposed.v1.dao.EntityClass

class CommentEntity(
    id: EntityID<Int>,
) : Entity<Int>(id) {
    companion object : EntityClass<Int, CommentEntity>(CommentTable)

    var body by CommentTable.body
    var postId by CommentTable.postId
    var post by PostEntity referencedOn CommentTable.postId
    var authorId by CommentTable.authorId
    var author by UserEntity optionalReferencedOn CommentTable.authorId
    var createdAt by CommentTable.createdAt
}
