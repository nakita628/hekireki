```mermaid
erDiagram
    User ||--}| Account : "(id) - (userId)"
    User ||--|| TwoFactorConfirmation : "(id) - (userId)"
    User {
        string id PK "Unique user ID"
        string name "Display name"
        string email "Email address"
        datetime emailVerified "Date when the email was verified"
        string image "Profile image URL"
        string password "Hashed password"
        userrole role "Role of the user (ADMIN or USER)"
        boolean isTwoFactorEnabled "Whether 2FA is enabled"
    }
    Account {
        string id PK "Unique account ID"
        string userId FK "Reference to the user ID"
        string type "Type of account (e.g., oauth, email)"
        string provider "Name of the provider (e.g., google, github)"
        string providerAccountId "Provider-specific account ID"
        string refresh_token "Refresh token"
        string access_token "Access token"
        int expires_at "Expiration time (UNIX timestamp)"
        string token_type "Token type (e.g., Bearer)"
        string scope "OAuth scope"
        string id_token "ID token"
        string session_state "Session state"
    }
    VerificationToken {
        string id PK "Token ID"
        string email "Email address"
        string token "Token string"
        datetime expires "Expiry time"
    }
    PasswordResetToken {
        string id PK "Token ID"
        string email "Email address"
        string token "Token string"
        datetime expires "Expiry time"
    }
    TwoFactorToken {
        string id PK "Token ID"
        string email "Email address"
        string token "Token string"
        datetime expires "Expiry time"
    }
    TwoFactorConfirmation {
        string id PK "Confirmation ID"
        string userId FK "Reference to user"
    }
```