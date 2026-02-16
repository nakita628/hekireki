```mermaid
erDiagram
    Organization ||--}| User : "(id) - (organizationId)"
    User ||--}| UserRole : "(id) - (userId)"
    Role ||--}| UserRole : "(id) - (roleId)"
    Role ||--}| RolePermission : "(id) - (roleId)"
    Permission ||--}| RolePermission : "(id) - (permissionId)"
    User ||--}| AuditLog : "(id) - (userId)"
    Organization {
        int id PK "Organization ID
@a."number.integer"
@e.Schema.Int"
        string name "Organization name
@a."1 <= string <= 200"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200))"
        string slug "URL-safe slug
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        orgstatus status "Organization status"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    User {
        int id PK "User ID
@a."number.integer"
@e.Schema.Int"
        int organizationId FK "Organization ID
@a."number.integer"
@e.Schema.Int"
        string email "Email address
@a."string.email"
@e.Schema.String"
        string name "Display name
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    Role {
        int id PK "Role ID
@a."number.integer"
@e.Schema.Int"
        string name "Role name
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        string description "Role description
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }
    Permission {
        int id PK "Permission ID
@a."number.integer"
@e.Schema.Int"
        string resource "Resource name
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        string action "Action name
@a."1 <= string <= 100"
@e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))"
        string description "Permission description
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime createdAt "Creation timestamp"
    }
    UserRole {
        int userId FK "User ID
@a."number.integer"
@e.Schema.Int"
        int roleId FK "Role ID
@a."number.integer"
@e.Schema.Int"
        datetime assignedAt "Assignment timestamp"
    }
    RolePermission {
        int roleId FK "Role ID
@a."number.integer"
@e.Schema.Int"
        int permissionId FK "Permission ID
@a."number.integer"
@e.Schema.Int"
        datetime assignedAt "Assignment timestamp"
    }
    AuditLog {
        int id PK "Audit log ID
@a."number.integer"
@e.Schema.Int"
        int userId FK "User ID
@a."number.integer"
@e.Schema.Int"
        string action "Action performed
@a."string"
@e.Schema.String"
        string resource "Resource name
@a."string"
@e.Schema.String"
        string detail "Action detail
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        string ipAddress "Client IP address
@a."string | null"
@e.Schema.NullOr(Schema.String)"
        datetime createdAt "Action timestamp"
    }
```