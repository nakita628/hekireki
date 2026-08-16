```mermaid
erDiagram
    users ||--|| Profile : "(id) - (userId)"
    users ||--}| posts : "(id) - (authorId)"
    posts ||--}| comments : "(id) - (postId)"
    users ||--}o comments : "(id) - (authorId)"
    users ||--}| follows : "(id) - (followerId)"
    users ||--}| follows : "(id) - (followingId)"
    Category ||--}o Category : "(id) - (parentId)"
    users ||--}| orders : "(id) - (userId)"
    orders ||--}| order_items : "(id) - (orderId)"
    users {
        string id PK "Primary key (UUIDv7)"
        string email "Unique login email"
        string name "Display name"
        role role
        string interests
        datetime createdAt
        datetime updatedAt
    }
    Profile {
        string id PK
        string userId FK
        string bio
        string nickname
        int age
        decimal balance
        boolean verified
        json meta
        bytes avatar
        datetime lastSeen
    }
    posts {
        string id PK "Primary key"
        string title "Article title"
        string content
        visibility visibility
        boolean published
        int viewCount
        string authorId FK
        datetime createdAt
    }
    Tag {
        int id PK
        string label
    }
    comments {
        int id PK
        string body
        string postId FK
        string authorId FK
        datetime createdAt
    }
    follows {
        string followerId FK
        string followingId FK
        datetime since
    }
    Category {
        int id PK
        string name
        int parentId FK
    }
    orders {
        bigint id PK
        string userId FK
        decimal total
        datetime placedAt
    }
    order_items {
        bigint id PK
        bigint orderId FK
        string sku
        int qty
        decimal price
    }
    audit_logs {
        string id PK
        string action
        json payload
        bytes signature
        datetime loggedAt
    }
    Actor {
        int id PK
        string name
    }
    Film {
        int id PK
        string title
    }
```