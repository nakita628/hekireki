```mermaid
erDiagram
    User ||--}| OAuthAccount : "(id) - (userId)"
    User ||--|| TwoFactorSetting : "(id) - (userId)"
    User ||--}| RefreshToken : "(id) - (userId)"
    User ||--}| EmailVerification : "(id) - (userId)"
    User ||--}| PasswordReset : "(id) - (userId)"
    User {
        string id PK "User ID"
        string email "Email address"
        string passwordHash "Hashed password (null for OAuth-only users)"
        string name "Display name"
        string avatarUrl "Profile image URL"
        role role "User role"
        boolean emailVerified "Email verification status"
        boolean isActive "Account active status"
        datetime createdAt "Account creation timestamp"
        datetime updatedAt "Last update timestamp"
        datetime lastLoginAt "Last login timestamp"
    }
    OAuthAccount {
        string id PK "OAuth account ID"
        string userId FK "User ID"
        oauthprovider provider "OAuth provider"
        string providerAccountId "Provider account ID"
        string accessToken "Access token from provider"
        string refreshToken "Refresh token from provider"
        datetime expiresAt "Token expiration timestamp"
        datetime createdAt "Account creation timestamp"
    }
    TwoFactorSetting {
        string id PK "2FA setting ID"
        string userId FK "User ID"
        boolean enabled "2FA enabled status"
        twofactormethod method "2FA method"
        string totpSecret "TOTP secret (encrypted)"
        string phoneNumber "Phone number for SMS (E.164 format)"
        string backupCodes "Backup codes (hashed, JSON array)"
        datetime verifiedAt "Last verified timestamp"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    RefreshToken {
        string id PK "Refresh token ID"
        string userId FK "User ID"
        string tokenHash "Token hash (SHA-256)"
        string deviceInfo "Device/client identifier"
        string ipAddress "IP address at creation"
        datetime expiresAt "Token expiration timestamp"
        datetime createdAt "Token creation timestamp"
        boolean revoked "Revocation status"
    }
    EmailVerification {
        string id PK "Verification ID"
        string userId FK "User ID"
        string tokenHash "Verification token (hashed)"
        datetime expiresAt "Token expiration timestamp"
        datetime createdAt "Creation timestamp"
    }
    PasswordReset {
        string id PK "Reset ID"
        string userId FK "User ID"
        string tokenHash "Reset token (hashed)"
        datetime expiresAt "Token expiration timestamp"
        boolean used "Used status"
        datetime createdAt "Creation timestamp"
    }
```