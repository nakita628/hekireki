```mermaid
erDiagram
    User ||--}| Post : "(id) - (userId)"
    User ||--}| Follow : "(id) - (followerId)"
    User ||--}| Follow : "(id) - (followingId)"
    User ||--}| Like : "(id) - (userId)"
    Post ||--}| Like : "(id) - (postId)"
    User ||--}| Comment : "(id) - (userId)"
    Post ||--}| Comment : "(id) - (postId)"
    User ||--}| Notification : "(id) - (userId)"
    User {
        string id PK "Unique identifier for the user
@a."string.uuid"
@e.Schema.UUID"
        string name "User's display name
@a."string"
@e.Schema.String"
        string username "Unique username for the user
@a."string"
@e.Schema.String"
        string bio "User's biography or profile description
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string email "User's unique email address
@a."string.email"
@e.Schema.String"
        datetime emailVerified "Timestamp of email verification
@a."string.date.iso | null"
@e.Schema.NullOr(Schema.DateFromString)"
        string image "URL of user's image
@a."string.url | null"
@e.Schema.NullOr(Schema.String)"
        string coverImage "URL of user's cover image
@a."string.url | null"
@e.Schema.NullOr(Schema.String)"
        string profileImage "URL of user's profile image
@a."string.url | null"
@e.Schema.NullOr(Schema.String)"
        string hashedPassword "Hashed password for security
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime createdAt "Timestamp when the user was created
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime updatedAt "Timestamp when the user was last updated
@a."string.date.iso"
@e.Schema.DateFromString"
        boolean hasNotification "Flag indicating if user has unread notifications
@a."boolean | null"
@e.Schema.NullOr(Schema.Boolean)"
    }
    Post {
        string id PK "Unique identifier for the post
@a."string.uuid"
@e.Schema.UUID"
        string body "Content of the post
@a."1 <= string <= 1000"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(1000))"
        datetime createdAt "Timestamp when the post was created
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime updatedAt "Timestamp when the post was last updated
@a."string.date.iso"
@e.Schema.DateFromString"
        string userId FK "ID of the user who created the post
@a."string.uuid"
@e.Schema.UUID"
    }
    Follow {
        string followerId FK "ID of the user who is following
@a."string.uuid"
@e.Schema.UUID"
        string followingId FK "ID of the user being followed
@a."string.uuid"
@e.Schema.UUID"
        datetime createdAt "Timestamp when the follow relationship was created
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    Like {
        string userId FK "ID of the user who liked the post
@a."string.uuid"
@e.Schema.UUID"
        string postId FK "ID of the post that was liked
@a."string.uuid"
@e.Schema.UUID"
        datetime createdAt "Timestamp when the like was created
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    Comment {
        string id PK "Unique identifier for the comment
@a."string.uuid"
@e.Schema.UUID"
        string body "Content of the comment
@a."string"
@e.Schema.String"
        datetime createdAt "Timestamp when the comment was created
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime updatedAt "Timestamp when the comment was last updated
@a."string.date.iso"
@e.Schema.DateFromString"
        string userId FK "ID of the user who created the comment
@a."string.uuid"
@e.Schema.UUID"
        string postId FK "ID of the post this comment belongs to
@a."string.uuid"
@e.Schema.UUID"
    }
    Notification {
        string id PK "Unique identifier for the notification
@a."string.uuid"
@e.Schema.UUID"
        string body "Content of the notification message
@a."string"
@e.Schema.String"
        string userId FK "ID of the user who receives the notification
@a."string.uuid"
@e.Schema.UUID"
        datetime createdAt "Timestamp when the notification was created
@a."string.date.iso"
@e.Schema.DateFromString"
    }
```