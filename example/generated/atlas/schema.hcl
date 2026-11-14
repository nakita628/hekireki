# User role. No @map: the value names are stored verbatim.
enum "Role" {
  schema = schema.public
  values = ["ADMIN", "EDITOR", "VIEWER"]
}

# Enum with @map on every value and @@map on the enum itself:
# the database stores the mapped values ("link_only"), while
# generators receive the Prisma-level names ("LINK_ONLY").
enum "visibility_level" {
  schema = schema.public
  values = ["public", "private", "link_only"]
}

# Application user. Fully annotated for every validator generator,
# with a UUIDv7 primary key, enum default, scalar list, @map columns,
# @updatedAt, and relations of every cardinality.
table "users" {
  schema = schema.public
  # Primary key (UUIDv7)
  column "id" {
    null = false
    type = text
  }
  # Unique login email
  column "email" {
    null = false
    type = text
  }
  # Display name
  column "name" {
    null = false
    type = text
  }
  column "role" {
    null    = false
    type    = enum.Role
    default = "VIEWER"
  }
  column "interests" {
    null    = true
    type    = sql("text[]")
    default = sql("ARRAY[]::text[]")
  }
  column "created_at" {
    null    = false
    type    = timestamp(3)
    default = sql("CURRENT_TIMESTAMP")
  }
  column "updated_at" {
    null = false
    type = timestamp(3)
  }
  primary_key {
    columns = [column.id]
  }
  index "users_email_key" {
    unique  = true
    columns = [column.email]
  }
}

# One-to-one relation with native @db.* types, literal defaults,
# and optional scalars of every flavour. ConfigDict passthrough: the
# Pydantic model rejects unknown keys (extra='forbid').
table "Profile" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
  column "user_id" {
    null = false
    type = text
  }
  column "bio" {
    null = true
    type = text
  }
  column "nickname" {
    null    = false
    type    = varchar(64)
    default = "anonymous"
  }
  column "age" {
    null = true
    type = smallint
  }
  column "balance" {
    null    = false
    type    = decimal(10, 2)
    default = 0
  }
  column "verified" {
    null    = false
    type    = boolean
    default = false
  }
  column "meta" {
    null = true
    type = jsonb
  }
  column "avatar" {
    null = true
    type = bytea
  }
  column "last_seen" {
    null = true
    type = timestamptz(6)
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "Profile_user_id_fkey" {
    columns     = [column.user_id]
    ref_columns = [table.users.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  index "Profile_user_id_key" {
    unique  = true
    columns = [column.user_id]
  }
}

# @@map + @map column names, FK with a referential action,
# mapped-enum default, and an implicit many-to-many to Tag.
table "posts" {
  schema = schema.public
  # Primary key
  column "id" {
    null = false
    type = text
  }
  # Article title
  column "title" {
    null = false
    type = text
  }
  column "content" {
    null = true
    type = text
  }
  column "visibility" {
    null    = false
    type    = enum.visibility_level
    default = "link_only"
  }
  column "published" {
    null    = false
    type    = boolean
    default = false
  }
  column "view_count" {
    null    = false
    type    = integer
    default = 0
  }
  column "author_id" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamp(3)
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "posts_author_id_fkey" {
    columns     = [column.author_id]
    ref_columns = [table.users.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  index "posts_author_id_idx" {
    columns = [column.author_id]
  }
}

# Implicit many-to-many partner of Post (join table `_PostToTag`).
table "Tag" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "label" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
  index "Tag_label_key" {
    unique  = true
    columns = [column.label]
  }
}

# Two foreign keys with different referential actions
# (Cascade vs SetNull) and a composite index.
table "comments" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "body" {
    null = false
    type = text
  }
  column "post_id" {
    null = false
    type = text
  }
  column "author_id" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamp(3)
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "comments_post_id_fkey" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  foreign_key "comments_author_id_fkey" {
    columns     = [column.author_id]
    ref_columns = [table.users.column.id]
    on_update   = CASCADE
    on_delete   = SET_NULL
  }
  index "comments_post_id_created_at_idx" {
    columns = [column.post_id, column.created_at]
  }
}

# Composite primary key + two named relations to the same model.
table "follows" {
  schema = schema.public
  column "follower_id" {
    null = false
    type = text
  }
  column "following_id" {
    null = false
    type = text
  }
  column "since" {
    null    = false
    type    = timestamp(3)
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.follower_id, column.following_id]
  }
  foreign_key "follows_follower_id_fkey" {
    columns     = [column.follower_id]
    ref_columns = [table.users.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  foreign_key "follows_following_id_fkey" {
    columns     = [column.following_id]
    ref_columns = [table.users.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
}

# Self-relation (adjacency-list tree) with a composite unique.
table "Category" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "name" {
    null = false
    type = text
  }
  column "parent_id" {
    null = true
    type = integer
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "Category_parent_id_fkey" {
    columns     = [column.parent_id]
    ref_columns = [table.Category.column.id]
    on_update   = CASCADE
    on_delete   = SET_NULL
  }
  index "Category_parent_id_name_key" {
    unique  = true
    columns = [column.parent_id, column.name]
  }
}

# BigInt autoincrement primary key (bigserial) and money as Decimal.
table "orders" {
  schema = schema.public
  column "id" {
    null = false
    type = bigserial
  }
  column "user_id" {
    null = false
    type = text
  }
  column "total" {
    null = false
    type = decimal(12, 2)
  }
  column "placed_at" {
    null    = false
    type    = timestamp(3)
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "orders_user_id_fkey" {
    columns     = [column.user_id]
    ref_columns = [table.users.column.id]
    on_update   = CASCADE
    on_delete   = RESTRICT
  }
}

# Child of Order with a composite unique constraint.
table "order_items" {
  schema = schema.public
  column "id" {
    null = false
    type = bigserial
  }
  column "order_id" {
    null = false
    type = bigint
  }
  column "sku" {
    null = false
    type = varchar(32)
  }
  column "qty" {
    null    = false
    type    = integer
    default = 1
  }
  column "price" {
    null = false
    type = decimal(12, 2)
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "order_items_order_id_fkey" {
    columns     = [column.order_id]
    ref_columns = [table.orders.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  index "order_items_order_id_sku_key" {
    unique  = true
    columns = [column.order_id, column.sku]
  }
}

# DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
table "audit_logs" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "action" {
    null = false
    type = text
  }
  column "payload" {
    null    = false
    type    = jsonb
    default = "{}"
  }
  column "signature" {
    null = true
    type = bytea
  }
  column "logged_at" {
    null    = false
    type    = timestamp(3)
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
}

# Named implicit many-to-many: the join table is `_cast`,
# not `_ActorToFilm`.
table "Actor" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "name" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
}

table "Film" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "title" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
}

table "_PostToTag" {
  schema = schema.public
  column "A" {
    null = false
    type = text
  }
  column "B" {
    null = false
    type = integer
  }
  primary_key "_PostToTag_AB_pkey" {
    columns = [column.A, column.B]
  }
  foreign_key "_PostToTag_A_fkey" {
    columns     = [column.A]
    ref_columns = [table.posts.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  foreign_key "_PostToTag_B_fkey" {
    columns     = [column.B]
    ref_columns = [table.Tag.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  index "_PostToTag_B_index" {
    columns = [column.B]
  }
}

table "_cast" {
  schema = schema.public
  column "A" {
    null = false
    type = integer
  }
  column "B" {
    null = false
    type = integer
  }
  primary_key "_cast_AB_pkey" {
    columns = [column.A, column.B]
  }
  foreign_key "_cast_A_fkey" {
    columns     = [column.A]
    ref_columns = [table.Actor.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  foreign_key "_cast_B_fkey" {
    columns     = [column.B]
    ref_columns = [table.Film.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  index "_cast_B_index" {
    columns = [column.B]
  }
}

schema "public" {}
