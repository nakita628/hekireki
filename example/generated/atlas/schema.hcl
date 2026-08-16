enum "Role" {
  schema = schema.public
  values = ["ADMIN", "EDITOR", "VIEWER"]
}

enum "visibility_level" {
  schema = schema.public
  values = ["public", "private", "link_only"]
}

table "users" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
  column "email" {
    null = false
    type = text
  }
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

table "posts" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
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
  primary_key {
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
  primary_key {
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
