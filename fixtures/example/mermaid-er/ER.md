```mermaid
erDiagram
    User ||--}| Post : "(id) - (userId)"
    User {
        string id PK "Primary key
@a."string.uuid"
@e.Schema.UUID"
        string name "Display name
@a."1 <= string <= 50"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50))"
    }
    Post {
        string id PK "Primary key
@a."string.uuid"
@e.Schema.UUID"
        string title "Article title
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        string content "Body content (no length limit)
@a."string"
@e.Schema.String"
        string userId FK "Foreign key referencing User.id
@a."string.uuid"
@e.Schema.UUID"
    }
```