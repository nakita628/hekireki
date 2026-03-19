```mermaid
erDiagram
    User ||--|| Profile : "(id) - (userId)"
    User ||--}| Post : "(id) - (authorId)"
    Post ||--}| Comment : "(id) - (postId)"
    User ||--}| Comment : "(id) - (authorId)"
    Post ||--}| PostTag : "(id) - (postId)"
    Tag ||--}| PostTag : "(id) - (tagId)"
    User {
        int id PK "User ID
@a."number.integer"
@e.Schema.Int"
        string email "Email address
@a."string.email"
@e.Schema.String"
        string name "Display name
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        string bio "Biography
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string avatarUrl "Avatar URL
@a."string.url | null"
@e.Schema.NullOr(Schema.String)"
        role role "User role"
        boolean active "Account active status
@a."boolean"
@e.Schema.Boolean"
        decimal score "Score
@a."number"
@e.Schema.Number"
        string tags "Tags
@a."string[]"
@e.Schema.Array(Schema.String)"
        json metadata "Metadata JSON
@a."unknown | null"
@e.Schema.NullOr(Schema.Unknown)"
        datetime createdAt "Account creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    Profile {
        string id PK "Profile ID
@a."string.uuid"
@e.Schema.UUID"
        int userId FK "User ID
@a."number.integer"
@e.Schema.Int"
        string website "Website URL
@a."string.url | null"
@e.Schema.NullOr(Schema.String)"
        string location "Location
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime birthDate "Birth date
@a."string.date.iso | null"
@e.Schema.NullOr(Schema.DateFromString)"
    }
    Post {
        int id PK "Post ID
@a."number.integer"
@e.Schema.Int"
        string title "Post title
@a."1 <= string <= 200"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200))"
        string slug "URL slug
@a."string"
@e.Schema.String"
        string content "Post content
@a."string"
@e.Schema.String"
        poststatus status "Publication status"
        int views "View count
@a."number.integer"
@e.Schema.Int"
        int authorId FK "Author user ID
@a."number.integer"
@e.Schema.Int"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    Comment {
        int id PK "Comment ID
@a."number.integer"
@e.Schema.Int"
        string body "Comment body
@a."string"
@e.Schema.String"
        int postId FK "Post ID
@a."number.integer"
@e.Schema.Int"
        int authorId FK "Author user ID
@a."number.integer"
@e.Schema.Int"
        datetime createdAt "Creation timestamp"
    }
    Tag {
        int id PK "Tag ID
@a."number.integer"
@e.Schema.Int"
        string name "Tag name
@a."1 <= string <= 50"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50))"
    }
    PostTag {
        int postId FK "Post ID
@a."number.integer"
@e.Schema.Int"
        int tagId FK "Tag ID
@a."number.integer"
@e.Schema.Int"
        datetime createdAt "Creation timestamp"
    }
    Session {
        string id PK "Session ID
@a."string"
@e.Schema.String"
        string token "Session token
@a."string"
@e.Schema.String"
        int userId "User ID
@a."number.integer"
@e.Schema.Int"
        datetime expiresAt "Expiration timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        string ipAddress "Client IP address
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string userAgent "User agent string
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime createdAt "Creation timestamp"
    }
    AuditLog {
        bigint id PK "Audit log ID
@a."number.integer"
@e.Schema.Int"
        string action "Action performed
@a."string"
@e.Schema.String"
        string tableName "Table name
@a."string"
@e.Schema.String"
        string recordId "Record ID
@a."string"
@e.Schema.String"
        json payload "Payload JSON"
        datetime createdAt "Creation timestamp"
    }
```
