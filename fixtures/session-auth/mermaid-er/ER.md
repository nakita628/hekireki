```mermaid
erDiagram
    User ||--}| Session : "(id) - (userId)"
    User ||--}| LoginHistory : "(id) - (userId)"
    User ||--}| PasswordHistory : "(id) - (userId)"
    User {
        string id PK "User ID
@a."string.uuid"
@e.Schema.UUID"
        string email "Email address
@a."string.email"
@e.Schema.String"
        string passwordHash "Hashed password
@a."string >= 8"
@e.Schema.String.pipe(Schema.minLength(8))"
        string name "Display name
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        role role "User role"
        boolean isActive "Account active status
@a."boolean"
@e.Schema.Boolean"
        datetime createdAt "Account creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    Session {
        string id PK "Session ID
@a."string.uuid"
@e.Schema.UUID"
        string token "Session token
@a."string"
@e.Schema.String"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        datetime expiresAt "Session expiration"
        string ipAddress "Client IP address
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string userAgent "Client user agent
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime createdAt "Session creation timestamp"
    }
    LoginHistory {
        string id PK "Login history ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        string ipAddress "Client IP address
@a."string"
@e.Schema.String"
        string userAgent "Client user agent
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        boolean success "Login success status
@a."boolean"
@e.Schema.Boolean"
        datetime createdAt "Login timestamp"
    }
    PasswordHistory {
        string id PK "Password history ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        string passwordHash "Hashed password
@a."string"
@e.Schema.String"
        datetime createdAt "Change timestamp"
    }
```