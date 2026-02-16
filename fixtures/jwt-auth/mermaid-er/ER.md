```mermaid
erDiagram
    User ||--}| OAuthAccount : "(id) - (userId)"
    User ||--|| TwoFactorSetting : "(id) - (userId)"
    User ||--}| RefreshToken : "(id) - (userId)"
    User ||--}| EmailVerification : "(id) - (userId)"
    User ||--}| PasswordReset : "(id) - (userId)"
    User {
        string id PK "User ID
@a."string.uuid"
@e.Schema.UUID"
        string email "Email address
@a."string.email"
@e.Schema.String"
        string passwordHash "Hashed password (null for OAuth-only users)
@a."string >= 8 | null"
@e.Schema.NullOr(Schema.String.pipe(Schema.minLength(8)))"
        string name "Display name
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        string avatarUrl "Profile image URL
@a."string.url | null"
@e.Schema.NullOr(Schema.String)"
        role role "User role"
        boolean emailVerified "Email verification status
@a."boolean"
@e.Schema.Boolean"
        boolean isActive "Account active status
@a."boolean"
@e.Schema.Boolean"
        datetime createdAt "Account creation timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime updatedAt "Last update timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime lastLoginAt "Last login timestamp
@a."string.date.iso | null"
@e.Schema.NullOr(Schema.DateFromString)"
    }
    OAuthAccount {
        string id PK "OAuth account ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        oauthprovider provider "OAuth provider"
        string providerAccountId "Provider account ID
@a."string"
@e.Schema.String"
        string accessToken "Access token from provider
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string refreshToken "Refresh token from provider
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime expiresAt "Token expiration timestamp
@a."string.date.iso | null"
@e.Schema.NullOr(Schema.DateFromString)"
        datetime createdAt "Account creation timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    TwoFactorSetting {
        string id PK "2FA setting ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        boolean enabled "2FA enabled status
@a."boolean"
@e.Schema.Boolean"
        twofactormethod method "2FA method"
        string totpSecret "TOTP secret (encrypted)
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string phoneNumber "Phone number for SMS (E.164 format)
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string backupCodes "Backup codes (hashed, JSON array)
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime verifiedAt "Last verified timestamp
@a."string.date.iso | null"
@e.Schema.NullOr(Schema.DateFromString)"
        datetime createdAt "Creation timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime updatedAt "Last update timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    RefreshToken {
        string id PK "Refresh token ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        string tokenHash "Token hash (SHA-256)
@a."string"
@e.Schema.String"
        string deviceInfo "Device/client identifier
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string ipAddress "IP address at creation
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime expiresAt "Token expiration timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime createdAt "Token creation timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        boolean revoked "Revocation status
@a."boolean"
@e.Schema.Boolean"
    }
    EmailVerification {
        string id PK "Verification ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        string tokenHash "Verification token (hashed)
@a."string"
@e.Schema.String"
        datetime expiresAt "Token expiration timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        datetime createdAt "Creation timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
    }
    PasswordReset {
        string id PK "Reset ID
@a."string.uuid"
@e.Schema.UUID"
        string userId FK "User ID
@a."string.uuid"
@e.Schema.UUID"
        string tokenHash "Reset token (hashed)
@a."string"
@e.Schema.String"
        datetime expiresAt "Token expiration timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
        boolean used "Used status
@a."boolean"
@e.Schema.Boolean"
        datetime createdAt "Creation timestamp
@a."string.date.iso"
@e.Schema.DateFromString"
    }
```