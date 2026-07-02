```mermaid
erDiagram
    users ||--}| sessions : "(id) - (userId)"
    users ||--}| login_histories : "(id) - (userId)"
    users ||--}| password_histories : "(id) - (userId)"
    users {
        string id PK "User ID"
        string email "Email address"
        string passwordHash "Hashed password"
        string name "Display name"
        role role "User role"
        boolean isActive "Account active status"
        datetime createdAt "Account creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    sessions {
        string id PK "Session ID"
        string token "Session token"
        string userId FK "User ID"
        datetime expiresAt "Session expiration"
        string ipAddress "Client IP address"
        string userAgent "Client user agent"
        datetime createdAt "Session creation timestamp"
    }
    login_histories {
        string id PK "Login history ID"
        string userId FK "User ID"
        string ipAddress "Client IP address"
        string userAgent "Client user agent"
        boolean success "Login success status"
        datetime createdAt "Login timestamp"
    }
    password_histories {
        string id PK "Password history ID"
        string userId FK "User ID"
        string passwordHash "Hashed password"
        datetime createdAt "Change timestamp"
    }
```
