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
        string id PK "Unique identifier for the user"
        string name "User's display name"
        string username "Unique username for the user"
        string bio "User's biography or profile description"
        string email "User's unique email address"
        datetime emailVerified "Timestamp of email verification"
        string image "URL of user's image"
        string coverImage "URL of user's cover image"
        string profileImage "URL of user's profile image"
        string hashedPassword "Hashed password for security"
        datetime createdAt "Timestamp when the user was created"
        datetime updatedAt "Timestamp when the user was last updated"
        boolean hasNotification "Flag indicating if user has unread notifications"
    }
    Post {
        string id PK "Unique identifier for the post"
        string body "Content of the post"
        datetime createdAt "Timestamp when the post was created"
        datetime updatedAt "Timestamp when the post was last updated"
        string userId FK "ID of the user who created the post"
    }
    Follow {
        string followerId FK "ID of the user who is following"
        string followingId FK "ID of the user being followed"
        datetime createdAt "Timestamp when the follow relationship was created"
    }
    Like {
        string userId FK "ID of the user who liked the post"
        string postId FK "ID of the post that was liked"
        datetime createdAt "Timestamp when the like was created"
    }
    Comment {
        string id PK "Unique identifier for the comment"
        string body "Content of the comment"
        datetime createdAt "Timestamp when the comment was created"
        datetime updatedAt "Timestamp when the comment was last updated"
        string userId FK "ID of the user who created the comment"
        string postId FK "ID of the post this comment belongs to"
    }
    Notification {
        string id PK "Unique identifier for the notification"
        string body "Content of the notification message"
        string userId FK "ID of the user who receives the notification"
        datetime createdAt "Timestamp when the notification was created"
    }
```