```mermaid
erDiagram
    organizations ||--}| users : "(id) - (organizationId)"
    users ||--}| user_roles : "(id) - (userId)"
    roles ||--}| user_roles : "(id) - (roleId)"
    roles ||--}| role_permissions : "(id) - (roleId)"
    permissions ||--}| role_permissions : "(id) - (permissionId)"
    users ||--}| audit_logs : "(id) - (userId)"
    organizations {
        int id PK "Organization ID"
        string name "Organization name"
        string slug "URL-safe slug"
        orgstatus status "Organization status"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    users {
        int id PK "User ID"
        int organizationId FK "Organization ID"
        string email "Email address"
        string name "Display name"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    roles {
        int id PK "Role ID"
        string name "Role name"
        string description "Role description"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    permissions {
        int id PK "Permission ID"
        string resource "Resource name"
        string action "Action name"
        string description "Permission description"
        datetime createdAt "Creation timestamp"
    }
    user_roles {
        int userId FK "User ID"
        int roleId FK "Role ID"
        datetime assignedAt "Assignment timestamp"
    }
    role_permissions {
        int roleId FK "Role ID"
        int permissionId FK "Permission ID"
        datetime assignedAt "Assignment timestamp"
    }
    audit_logs {
        int id PK "Audit log ID"
        int userId FK "User ID"
        string action "Action performed"
        string resource "Resource name"
        string detail "Action detail"
        string ipAddress "Client IP address"
        datetime createdAt "Action timestamp"
    }
```