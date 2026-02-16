```mermaid
erDiagram
    User ||--}| Account : "(id) - (userId)"
    User ||--|| TwoFactorConfirmation : "(id) - (userId)"
    User {
        string id PK "Unique user ID
@a."string"
@e.Schema.String"
        string name "Display name
@a."1 <= string <= 50"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50))"
        string email "Email address
@a."string.email"
@e.Schema.String"
        datetime emailVerified "Date when the email was verified
@a."string.date.iso"
@e.Schema.DateFromString"
        string image "Profile image URL
@a."string.url"
@e.Schema.String"
        string password "Hashed password
@a."string >= 8"
@e.Schema.String.pipe(Schema.minLength(8))"
        userrole role "Role of the user (ADMIN or USER)"
        boolean isTwoFactorEnabled "Whether 2FA is enabled
@a."boolean"
@e.Schema.Boolean"
    }
    Account {
        string id PK "Unique account ID
@a."string"
@e.Schema.String"
        string userId FK "Reference to the user ID
@a."string"
@e.Schema.String"
        string type "Type of account (e.g., oauth, email)
@a."string"
@e.Schema.String"
        string provider "Name of the provider (e.g., google, github)
@a."string"
@e.Schema.String"
        string providerAccountId "Provider-specific account ID
@a."string"
@e.Schema.String"
        string refresh_token "Refresh token
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string access_token "Access token
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        int expires_at "Expiration time (UNIX timestamp)
@a."number.integer"
@e.Schema.Int"
        string token_type "Token type (e.g., Bearer)
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string scope "OAuth scope
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string id_token "ID token
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string session_state "Session state
@a."string | null"
@e.Schema.NullOr(Schema.String)"
    }
    VerificationToken {
        string id PK "Token ID
@a."string"
@e.Schema.String"
        string email "Email address
@a."string.email"
@e.Schema.String"
        string token "Token string
@a."string"
@e.Schema.String"
        datetime expires "Expiry time
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    PasswordResetToken {
        string id PK "Token ID
@a."string"
@e.Schema.String"
        string email "Email address
@a."string.email"
@e.Schema.String"
        string token "Token string
@a."string"
@e.Schema.String"
        datetime expires "Expiry time
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    TwoFactorToken {
        string id PK "Token ID
@a."string"
@e.Schema.String"
        string email "Email address
@a."string.email"
@e.Schema.String"
        string token "Token string
@a."string"
@e.Schema.String"
        datetime expires "Expiry time
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    TwoFactorConfirmation {
        string id PK "Confirmation ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "Reference to user
@a."string"
@e.Schema.String"
    }
```