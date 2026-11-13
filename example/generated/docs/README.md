# Schema docs

![ER diagram](er.svg)

<details>
<summary>The whole schema as SQL</summary>

```sql
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

CREATE TYPE "visibility_level" AS ENUM ('public', 'private', 'link_only');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bio" TEXT,
    "nickname" VARCHAR(64) NOT NULL DEFAULT 'anonymous',
    "age" SMALLINT,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "avatar" BYTEA,
    "last_seen" TIMESTAMPTZ(6),

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "visibility" "visibility_level" NOT NULL DEFAULT 'link_only',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "follows" (
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","following_id")
);

CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" INTEGER,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "sku" VARCHAR(32) NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "signature" BYTEA,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Actor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Film" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Film_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_PostToTag" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PostToTag_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE "_cast" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_cast_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "Profile_user_id_key" ON "Profile"("user_id");

CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

CREATE UNIQUE INDEX "Tag_label_key" ON "Tag"("label");

CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

CREATE UNIQUE INDEX "Category_parent_id_name_key" ON "Category"("parent_id", "name");

CREATE UNIQUE INDEX "order_items_order_id_sku_key" ON "order_items"("order_id", "sku");

CREATE INDEX "_PostToTag_B_index" ON "_PostToTag"("B");

CREATE INDEX "_cast_B_index" ON "_cast"("B");

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_cast" ADD CONSTRAINT "_cast_A_fkey" FOREIGN KEY ("A") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_cast" ADD CONSTRAINT "_cast_B_fkey" FOREIGN KEY ("B") REFERENCES "Film"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

</details>

## Contents

| Model                         | Table         | Description                                                                                                                                                                             |
| ----------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [User](#model-User)           | `users`       | Application user. Fully annotated for every validator generator, with a UUIDv7 primary key, enum default, scalar list, @map columns, @updatedAt, and relations of every cardinality.    |
| [Profile](#model-Profile)     | `Profile`     | One-to-one relation with native @db.* types, literal defaults, and optional scalars of every flavour. ConfigDict passthrough: the Pydantic model rejects unknown keys (extra='forbid'). |
| [Post](#model-Post)           | `posts`       | @@map + @map column names, FK with a referential action, mapped-enum default, and an implicit many-to-many to Tag.                                                                      |
| [Tag](#model-Tag)             | `Tag`         | Implicit many-to-many partner of Post (join table `_PostToTag`).                                                                                                                        |
| [Comment](#model-Comment)     | `comments`    | Two foreign keys with different referential actions (Cascade vs SetNull) and a composite index.                                                                                         |
| [Follow](#model-Follow)       | `follows`     | Composite primary key + two named relations to the same model.                                                                                                                          |
| [Category](#model-Category)   | `Category`    | Self-relation (adjacency-list tree) with a composite unique.                                                                                                                            |
| [Order](#model-Order)         | `orders`      | BigInt autoincrement primary key (bigserial) and money as Decimal.                                                                                                                      |
| [OrderItem](#model-OrderItem) | `order_items` | Child of Order with a composite unique constraint.                                                                                                                                      |
| [AuditLog](#model-AuditLog)   | `audit_logs`  | DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.                                                                                                                    |
| [Actor](#model-Actor)         | `Actor`       | Named implicit many-to-many: the join table is `_cast`, not `_ActorToFilm`.                                                                                                             |
| [Film](#model-Film)           | `Film`        |                                                                                                                                                                                         |

| Enum                           | Name in the database | Description                                                                                                                                                                     |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Role](#enum-Role)             | `Role`               | User role. No @map: the value names are stored verbatim.                                                                                                                        |
| [Visibility](#enum-Visibility) | `visibility_level`   | Enum with @map on every value and @@map on the enum itself: the database stores the mapped values ("link_only"), while generators receive the Prisma-level names ("LINK_ONLY"). |

## Models

<a id="model-User"></a>

### User

Table `users`. Application user. Fully annotated for every validator generator,
with a UUIDv7 primary key, enum default, scalar list, @map columns,
@updatedAt, and relations of every cardinality.

![User and the models it relates to](tables/User.svg)

| Field                      | Type                 | Constraints     | Default      | Description          |
| -------------------------- | -------------------- | --------------- | ------------ | -------------------- |
| `id`                       | `String`             | PK NOT NULL     | `uuid(7)`    | Primary key (UUIDv7) |
| `email`                    | `String`             | UNIQUE NOT NULL |              | Unique login email   |
| `name`                     | `String`             | NOT NULL        |              | Display name         |
| `role`                     | [`Role`](#enum-Role) | NOT NULL        | `VIEWER`     |                      |
| `interests`                | `String[]`           | NOT NULL        | `[]`         |                      |
| `createdAt` (`created_at`) | `DateTime`           | NOT NULL        | `now()`      |                      |
| `updatedAt` (`updated_at`) | `DateTime`           | NOT NULL        | `@updatedAt` |                      |

#### Referenced by

- `id` ← [Profile.userId](#model-Profile) (one-to-one, on delete Cascade)
- `id` ← [Post.authorId](#model-Post) (one-to-many, on delete Cascade)
- `id` ← [Comment.authorId](#model-Comment) (one-to-many, on delete SetNull)
- `id` ← [Follow.followerId](#model-Follow) (one-to-many, on delete Cascade)
- `id` ← [Follow.followingId](#model-Follow) (one-to-many, on delete Cascade)
- `id` ← [Order.userId](#model-Order) (one-to-many)

#### Definition

```sql
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.user.findMany();
```

```sql
SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.user.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."users"."id"
    FROM
      "public"."users"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.user.findMany({
  include: {
    profile: true,
    posts: true,
    comments: true,
    orders: true,
    followers: true,
    following: true,
  },
});
```

```sql
SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."Profile"."id",
  "public"."Profile"."user_id",
  "public"."Profile"."bio",
  "public"."Profile"."nickname",
  "public"."Profile"."age",
  "public"."Profile"."balance",
  "public"."Profile"."verified",
  "public"."Profile"."meta",
  "public"."Profile"."avatar",
  "public"."Profile"."last_seen"
FROM
  "public"."Profile"
WHERE
  "public"."Profile"."user_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]

SELECT
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
FROM
  "public"."posts"
WHERE
  "public"."posts"."author_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]

SELECT
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
FROM
  "public"."comments"
WHERE
  "public"."comments"."author_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]

SELECT
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
FROM
  "public"."orders"
WHERE
  "public"."orders"."user_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]

SELECT
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
FROM
  "public"."follows"
WHERE
  "public"."follows"."following_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]

SELECT
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
FROM
  "public"."follows"
WHERE
  "public"."follows"."follower_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.user.findUnique({ where: { id: "example" } });
```

```sql
SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  (
    "public"."users"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["example","1","0"]
```

**create**: Create a row

```ts
await prisma.user.create({ data: { email: "example", name: "example" } });
```

```sql
INSERT INTO
  "public"."users" (
    "id",
    "email",
    "name",
    "role",
    "interests",
    "created_at",
    "updated_at"
  )
VALUES
  (
    $1,
    $2,
    $3,
    CAST($4::text AS "public"."Role"),
    $5,
    $6,
    $7
  )
RETURNING
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
-- params: ["<uuid(7)>","example","example","VIEWER",[],"<now()>","<now()>"]
```

**update**: Update a row

```ts
await prisma.user.update({ where: { id: "example" }, data: { email: "example" } });
```

```sql
UPDATE "public"."users"
SET
  "email" = $1,
  "updated_at" = $2
WHERE
  (
    "public"."users"."id" = $3
    AND 1 = 1
  )
RETURNING
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
-- params: ["example",{"prisma__type":"generatorCall","prisma__value":{"name":"now","args":[],"returnType":{"type":"DateTime"}}},"example"]
```

**delete**: Delete a row

```ts
await prisma.user.delete({ where: { id: "example" } });
```

```sql
DELETE FROM "public"."users"
WHERE
  (
    "public"."users"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
-- params: ["example"]
```

</details>

<a id="model-Profile"></a>

### Profile

One-to-one relation with native @db.* types, literal defaults,
and optional scalars of every flavour. ConfigDict passthrough: the
Pydantic model rejects unknown keys (extra='forbid').

![Profile and the models it relates to](tables/Profile.svg)

| Field                    | Type                            | Constraints                              | Default       | Description |
| ------------------------ | ------------------------------- | ---------------------------------------- | ------------- | ----------- |
| `id`                     | `String`                        | PK NOT NULL                              | `cuid(2)`     |             |
| `userId` (`user_id`)     | `String`                        | UNIQUE NOT NULL → [User.id](#model-User) |               |             |
| `bio`                    | `String` `@db.Text`             | NULL                                     |               |             |
| `nickname`               | `String` `@db.VarChar(64)`      | NOT NULL                                 | `"anonymous"` |             |
| `age`                    | `Int` `@db.SmallInt`            | NULL                                     |               |             |
| `balance`                | `Decimal` `@db.Decimal(10, 2)`  | NOT NULL                                 | `0`           |             |
| `verified`               | `Boolean`                       | NOT NULL                                 | `false`       |             |
| `meta`                   | `Json`                          | NULL                                     |               |             |
| `avatar`                 | `Bytes`                         | NULL                                     |               |             |
| `lastSeen` (`last_seen`) | `DateTime` `@db.Timestamptz(6)` | NULL                                     |               |             |

#### References

- `userId` → [User.id](#model-User) (one-to-one, on delete Cascade)

#### Definition

```sql
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bio" TEXT,
    "nickname" VARCHAR(64) NOT NULL DEFAULT 'anonymous',
    "age" SMALLINT,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "avatar" BYTEA,
    "last_seen" TIMESTAMPTZ(6),

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Profile_user_id_key" ON "Profile"("user_id");

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.profile.findMany();
```

```sql
SELECT
  "public"."Profile"."id",
  "public"."Profile"."user_id",
  "public"."Profile"."bio",
  "public"."Profile"."nickname",
  "public"."Profile"."age",
  "public"."Profile"."balance",
  "public"."Profile"."verified",
  "public"."Profile"."meta",
  "public"."Profile"."avatar",
  "public"."Profile"."last_seen"
FROM
  "public"."Profile"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.profile.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."Profile"."id"
    FROM
      "public"."Profile"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.profile.findMany({ include: { user: true } });
```

```sql
SELECT
  "public"."Profile"."id",
  "public"."Profile"."user_id",
  "public"."Profile"."bio",
  "public"."Profile"."nickname",
  "public"."Profile"."age",
  "public"."Profile"."balance",
  "public"."Profile"."verified",
  "public"."Profile"."meta",
  "public"."Profile"."avatar",
  "public"."Profile"."last_seen"
FROM
  "public"."Profile"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  "public"."users"."id" IN ($1)
OFFSET
  $2
-- params: ["<userId of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.profile.findUnique({ where: { id: "example" } });
```

```sql
SELECT
  "public"."Profile"."id",
  "public"."Profile"."user_id",
  "public"."Profile"."bio",
  "public"."Profile"."nickname",
  "public"."Profile"."age",
  "public"."Profile"."balance",
  "public"."Profile"."verified",
  "public"."Profile"."meta",
  "public"."Profile"."avatar",
  "public"."Profile"."last_seen"
FROM
  "public"."Profile"
WHERE
  (
    "public"."Profile"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["example","1","0"]
```

**create**: Create a row

```ts
await prisma.profile.create({ data: { userId: "example" } });
```

```sql
INSERT INTO
  "public"."Profile" (
    "id",
    "user_id",
    "nickname",
    "balance",
    "verified"
  )
VALUES
  ($1, $2, $3, $4, $5)
RETURNING
  "public"."Profile"."id",
  "public"."Profile"."user_id",
  "public"."Profile"."bio",
  "public"."Profile"."nickname",
  "public"."Profile"."age",
  "public"."Profile"."balance",
  "public"."Profile"."verified",
  "public"."Profile"."meta",
  "public"."Profile"."avatar",
  "public"."Profile"."last_seen"
-- params: ["<cuid(2)>","example","anonymous","0",false]
```

**update**: Update a row

```ts
await prisma.profile.update({ where: { id: "example" }, data: { bio: "example" } });
```

```sql
UPDATE "public"."Profile"
SET
  "bio" = $1
WHERE
  (
    "public"."Profile"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."Profile"."id",
  "public"."Profile"."user_id",
  "public"."Profile"."bio",
  "public"."Profile"."nickname",
  "public"."Profile"."age",
  "public"."Profile"."balance",
  "public"."Profile"."verified",
  "public"."Profile"."meta",
  "public"."Profile"."avatar",
  "public"."Profile"."last_seen"
-- params: ["example","example"]
```

**delete**: Delete a row

```ts
await prisma.profile.delete({ where: { id: "example" } });
```

```sql
DELETE FROM "public"."Profile"
WHERE
  (
    "public"."Profile"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."Profile"."id",
  "public"."Profile"."user_id",
  "public"."Profile"."bio",
  "public"."Profile"."nickname",
  "public"."Profile"."age",
  "public"."Profile"."balance",
  "public"."Profile"."verified",
  "public"."Profile"."meta",
  "public"."Profile"."avatar",
  "public"."Profile"."last_seen"
-- params: ["example"]
```

</details>

<a id="model-Post"></a>

### Post

Table `posts`. @@map + @map column names, FK with a referential action,
mapped-enum default, and an implicit many-to-many to Tag.

![Post and the models it relates to](tables/Post.svg)

| Field                      | Type                             | Constraints                       | Default     | Description   |
| -------------------------- | -------------------------------- | --------------------------------- | ----------- | ------------- |
| `id`                       | `String`                         | PK NOT NULL                       | `uuid(4)`   | Primary key   |
| `title`                    | `String`                         | NOT NULL                          |             | Article title |
| `content`                  | `String`                         | NULL                              |             |               |
| `visibility`               | [`Visibility`](#enum-Visibility) | NOT NULL                          | `LINK_ONLY` |               |
| `published`                | `Boolean`                        | NOT NULL                          | `false`     |               |
| `viewCount` (`view_count`) | `Int`                            | NOT NULL                          | `0`         |               |
| `authorId` (`author_id`)   | `String`                         | NOT NULL → [User.id](#model-User) |             |               |
| `createdAt` (`created_at`) | `DateTime`                       | NOT NULL                          | `now()`     |               |

#### Indexes

- `@@index([authorId])`

#### References

- `authorId` → [User.id](#model-User) (many-to-one, on delete Cascade)

#### Referenced by

- `id` ← [Comment.postId](#model-Comment) (one-to-many, on delete Cascade)

#### Many to many

- `tags` ↔ [Tag.posts](#model-Tag) through `_PostToTag`

#### Definition

```sql
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "visibility" "visibility_level" NOT NULL DEFAULT 'link_only',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.post.findMany();
```

```sql
SELECT
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
FROM
  "public"."posts"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.post.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."posts"."id"
    FROM
      "public"."posts"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.post.findMany({ include: { author: true, tags: true, comments: true } });
```

```sql
SELECT
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
FROM
  "public"."posts"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  "public"."users"."id" IN ($1)
OFFSET
  $2
-- params: ["<authorId of the rows above>","0"]

SELECT
  "public"."Tag"."id",
  "public"."Tag"."label",
  "t0"."A" AS "PostToTag@Post"
FROM
  "public"."Tag"
  INNER JOIN "public"."_PostToTag" AS "t0" ON "t0"."B" = "public"."Tag"."id"
WHERE
  (
    1 = 1
    AND "t0"."A" IN ($1)
  )
OFFSET
  $2
-- params: ["<id of the rows above>","0"]

SELECT
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
FROM
  "public"."comments"
WHERE
  "public"."comments"."post_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.post.findUnique({ where: { id: "example" } });
```

```sql
SELECT
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
FROM
  "public"."posts"
WHERE
  (
    "public"."posts"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["example","1","0"]
```

**create**: Create a row

```ts
await prisma.post.create({ data: { title: "example", authorId: "example" } });
```

```sql
INSERT INTO
  "public"."posts" (
    "id",
    "title",
    "visibility",
    "published",
    "view_count",
    "author_id",
    "created_at"
  )
VALUES
  (
    $1,
    $2,
    CAST($3::text AS "public"."visibility_level"),
    $4,
    $5,
    $6,
    $7
  )
RETURNING
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
-- params: ["<uuid(4)>","example","link_only",false,"0","example","<now()>"]
```

**update**: Update a row

```ts
await prisma.post.update({ where: { id: "example" }, data: { title: "example" } });
```

```sql
UPDATE "public"."posts"
SET
  "title" = $1
WHERE
  (
    "public"."posts"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
-- params: ["example","example"]
```

**delete**: Delete a row

```ts
await prisma.post.delete({ where: { id: "example" } });
```

```sql
DELETE FROM "public"."posts"
WHERE
  (
    "public"."posts"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
-- params: ["example"]
```

</details>

<a id="model-Tag"></a>

### Tag

Implicit many-to-many partner of Post (join table `_PostToTag`).

![Tag and the models it relates to](tables/Tag.svg)

| Field   | Type     | Constraints     | Default           | Description |
| ------- | -------- | --------------- | ----------------- | ----------- |
| `id`    | `Int`    | PK NOT NULL     | `autoincrement()` |             |
| `label` | `String` | UNIQUE NOT NULL |                   |             |

#### Many to many

- `posts` ↔ [Post.tags](#model-Post) through `_PostToTag`

#### Definition

```sql
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_label_key" ON "Tag"("label");
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.tag.findMany();
```

```sql
SELECT
  "public"."Tag"."id",
  "public"."Tag"."label"
FROM
  "public"."Tag"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.tag.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."Tag"."id"
    FROM
      "public"."Tag"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.tag.findMany({ include: { posts: true } });
```

```sql
SELECT
  "public"."Tag"."id",
  "public"."Tag"."label"
FROM
  "public"."Tag"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at",
  "t0"."B" AS "PostToTag@Tag"
FROM
  "public"."posts"
  INNER JOIN "public"."_PostToTag" AS "t0" ON "t0"."A" = "public"."posts"."id"
WHERE
  (
    1 = 1
    AND "t0"."B" IN ($1)
  )
OFFSET
  $2
-- params: ["<id of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.tag.findUnique({ where: { id: 1 } });
```

```sql
SELECT
  "public"."Tag"."id",
  "public"."Tag"."label"
FROM
  "public"."Tag"
WHERE
  (
    "public"."Tag"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["1","1","0"]
```

**create**: Create a row

```ts
await prisma.tag.create({ data: { label: "example" } });
```

```sql
INSERT INTO
  "public"."Tag" ("label")
VALUES
  ($1)
RETURNING
  "public"."Tag"."id",
  "public"."Tag"."label"
-- params: ["example"]
```

**update**: Update a row

```ts
await prisma.tag.update({ where: { id: 1 }, data: { label: "example" } });
```

```sql
UPDATE "public"."Tag"
SET
  "label" = $1
WHERE
  (
    "public"."Tag"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."Tag"."id",
  "public"."Tag"."label"
-- params: ["example","1"]
```

**delete**: Delete a row

```ts
await prisma.tag.delete({ where: { id: 1 } });
```

```sql
DELETE FROM "public"."Tag"
WHERE
  (
    "public"."Tag"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."Tag"."id",
  "public"."Tag"."label"
-- params: ["1"]
```

</details>

<a id="model-Comment"></a>

### Comment

Table `comments`. Two foreign keys with different referential actions
(Cascade vs SetNull) and a composite index.

![Comment and the models it relates to](tables/Comment.svg)

| Field                      | Type       | Constraints                       | Default           | Description |
| -------------------------- | ---------- | --------------------------------- | ----------------- | ----------- |
| `id`                       | `Int`      | PK NOT NULL                       | `autoincrement()` |             |
| `body`                     | `String`   | NOT NULL                          |                   |             |
| `postId` (`post_id`)       | `String`   | NOT NULL → [Post.id](#model-Post) |                   |             |
| `authorId` (`author_id`)   | `String`   | NULL → [User.id](#model-User)     |                   |             |
| `createdAt` (`created_at`) | `DateTime` | NOT NULL                          | `now()`           |             |

#### Indexes

- `@@index([postId, createdAt])`

#### References

- `postId` → [Post.id](#model-Post) (many-to-one, on delete Cascade)
- `authorId` → [User.id](#model-User) (many-to-one, on delete SetNull)

#### Definition

```sql
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.comment.findMany();
```

```sql
SELECT
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
FROM
  "public"."comments"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.comment.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."comments"."id"
    FROM
      "public"."comments"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.comment.findMany({ include: { post: true, author: true } });
```

```sql
SELECT
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
FROM
  "public"."comments"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."posts"."id",
  "public"."posts"."title",
  "public"."posts"."content",
  "public"."posts"."visibility"::text,
  "public"."posts"."published",
  "public"."posts"."view_count",
  "public"."posts"."author_id",
  "public"."posts"."created_at"
FROM
  "public"."posts"
WHERE
  "public"."posts"."id" IN ($1)
OFFSET
  $2
-- params: ["<postId of the rows above>","0"]

SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  "public"."users"."id" IN ($1)
OFFSET
  $2
-- params: ["<authorId of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.comment.findUnique({ where: { id: 1 } });
```

```sql
SELECT
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
FROM
  "public"."comments"
WHERE
  (
    "public"."comments"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["1","1","0"]
```

**create**: Create a row

```ts
await prisma.comment.create({ data: { body: "example", postId: "example" } });
```

```sql
INSERT INTO
  "public"."comments" ("body", "post_id", "created_at")
VALUES
  ($1, $2, $3)
RETURNING
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
-- params: ["example","example","<now()>"]
```

**update**: Update a row

```ts
await prisma.comment.update({ where: { id: 1 }, data: { body: "example" } });
```

```sql
UPDATE "public"."comments"
SET
  "body" = $1
WHERE
  (
    "public"."comments"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
-- params: ["example","1"]
```

**delete**: Delete a row

```ts
await prisma.comment.delete({ where: { id: 1 } });
```

```sql
DELETE FROM "public"."comments"
WHERE
  (
    "public"."comments"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."comments"."id",
  "public"."comments"."body",
  "public"."comments"."post_id",
  "public"."comments"."author_id",
  "public"."comments"."created_at"
-- params: ["1"]
```

</details>

<a id="model-Follow"></a>

### Follow

Table `follows`. Composite primary key + two named relations to the same model.

![Follow and the models it relates to](tables/Follow.svg)

| Field                          | Type       | Constraints                          | Default | Description |
| ------------------------------ | ---------- | ------------------------------------ | ------- | ----------- |
| `followerId` (`follower_id`)   | `String`   | PK NOT NULL → [User.id](#model-User) |         |             |
| `followingId` (`following_id`) | `String`   | PK NOT NULL → [User.id](#model-User) |         |             |
| `since`                        | `DateTime` | NOT NULL                             | `now()` |             |

#### Indexes

- `@@id([followerId, followingId])`

#### References

- `followerId` → [User.id](#model-User) (many-to-one, on delete Cascade)
- `followingId` → [User.id](#model-User) (many-to-one, on delete Cascade)

#### Definition

```sql
CREATE TABLE "follows" (
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","following_id")
);

ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.follow.findMany();
```

```sql
SELECT
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
FROM
  "public"."follows"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.follow.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."follows"."follower_id",
      "public"."follows"."following_id"
    FROM
      "public"."follows"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.follow.findMany({ include: { follower: true, following: true } });
```

```sql
SELECT
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
FROM
  "public"."follows"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  "public"."users"."id" IN ($1)
OFFSET
  $2
-- params: ["<followerId of the rows above>","0"]

SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  "public"."users"."id" IN ($1)
OFFSET
  $2
-- params: ["<followingId of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.follow.findUnique({
  where: { followerId_followingId: { followerId: "example", followingId: "example" } },
});
```

```sql
SELECT
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
FROM
  "public"."follows"
WHERE
  (
    (
      "public"."follows"."follower_id" = $1
      AND "public"."follows"."following_id" = $2
    )
    AND 1 = 1
  )
LIMIT
  $3
OFFSET
  $4
-- params: ["example","example","1","0"]
```

**create**: Create a row

```ts
await prisma.follow.create({ data: { followerId: "example", followingId: "example" } });
```

```sql
INSERT INTO
  "public"."follows" ("follower_id", "following_id", "since")
VALUES
  ($1, $2, $3)
RETURNING
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
-- params: ["example","example","<now()>"]
```

**update**: Update a row

```ts
await prisma.follow.update({
  where: { followerId_followingId: { followerId: "example", followingId: "example" } },
  data: { since: new Date("2026-01-01T00:00:00.000Z") },
});
```

```sql
UPDATE "public"."follows"
SET
  "since" = $1
WHERE
  (
    (
      "public"."follows"."follower_id" = $2
      AND "public"."follows"."following_id" = $3
    )
    AND 1 = 1
  )
RETURNING
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
-- params: ["2026-01-01T00:00:00.000Z","example","example"]
```

**delete**: Delete a row

```ts
await prisma.follow.delete({
  where: { followerId_followingId: { followerId: "example", followingId: "example" } },
});
```

```sql
DELETE FROM "public"."follows"
WHERE
  (
    (
      "public"."follows"."follower_id" = $1
      AND "public"."follows"."following_id" = $2
    )
    AND 1 = 1
  )
RETURNING
  "public"."follows"."follower_id",
  "public"."follows"."following_id",
  "public"."follows"."since"
-- params: ["example","example"]
```

</details>

<a id="model-Category"></a>

### Category

Self-relation (adjacency-list tree) with a composite unique.

![Category and the models it relates to](tables/Category.svg)

| Field                    | Type     | Constraints                           | Default           | Description |
| ------------------------ | -------- | ------------------------------------- | ----------------- | ----------- |
| `id`                     | `Int`    | PK NOT NULL                           | `autoincrement()` |             |
| `name`                   | `String` | NOT NULL                              |                   |             |
| `parentId` (`parent_id`) | `Int`    | NULL → [Category.id](#model-Category) |                   |             |

#### Indexes

- `@@unique([parentId, name])`

#### References

- `parentId` → [Category.id](#model-Category) (many-to-one)

#### Referenced by

- `id` ← [Category.parentId](#model-Category) (one-to-many)

#### Definition

```sql
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" INTEGER,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_parent_id_name_key" ON "Category"("parent_id", "name");

ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.category.findMany();
```

```sql
SELECT
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
FROM
  "public"."Category"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.category.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."Category"."id"
    FROM
      "public"."Category"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.category.findMany({ include: { parent: true, children: true } });
```

```sql
SELECT
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
FROM
  "public"."Category"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
FROM
  "public"."Category"
WHERE
  "public"."Category"."id" IN ($1)
OFFSET
  $2
-- params: ["<parentId of the rows above>","0"]

SELECT
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
FROM
  "public"."Category"
WHERE
  "public"."Category"."parent_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.category.findUnique({ where: { id: 1 } });
```

```sql
SELECT
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
FROM
  "public"."Category"
WHERE
  (
    "public"."Category"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["1","1","0"]
```

**create**: Create a row

```ts
await prisma.category.create({ data: { name: "example" } });
```

```sql
INSERT INTO
  "public"."Category" ("name")
VALUES
  ($1)
RETURNING
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
-- params: ["example"]
```

**update**: Update a row

```ts
await prisma.category.update({ where: { id: 1 }, data: { name: "example" } });
```

```sql
UPDATE "public"."Category"
SET
  "name" = $1
WHERE
  (
    "public"."Category"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
-- params: ["example","1"]
```

**delete**: Delete a row

```ts
await prisma.category.delete({ where: { id: 1 } });
```

```sql
DELETE FROM "public"."Category"
WHERE
  (
    "public"."Category"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."Category"."id",
  "public"."Category"."name",
  "public"."Category"."parent_id"
-- params: ["1"]
```

</details>

<a id="model-Order"></a>

### Order

Table `orders`. BigInt autoincrement primary key (bigserial) and money as Decimal.

![Order and the models it relates to](tables/Order.svg)

| Field                    | Type                           | Constraints                       | Default           | Description |
| ------------------------ | ------------------------------ | --------------------------------- | ----------------- | ----------- |
| `id`                     | `BigInt`                       | PK NOT NULL                       | `autoincrement()` |             |
| `userId` (`user_id`)     | `String`                       | NOT NULL → [User.id](#model-User) |                   |             |
| `total`                  | `Decimal` `@db.Decimal(12, 2)` | NOT NULL                          |                   |             |
| `placedAt` (`placed_at`) | `DateTime`                     | NOT NULL                          | `now()`           |             |

#### References

- `userId` → [User.id](#model-User) (many-to-one)

#### Referenced by

- `id` ← [OrderItem.orderId](#model-OrderItem) (one-to-many, on delete Cascade)

#### Definition

```sql
CREATE TABLE "orders" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.order.findMany();
```

```sql
SELECT
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
FROM
  "public"."orders"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.order.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."orders"."id"
    FROM
      "public"."orders"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.order.findMany({ include: { user: true, items: true } });
```

```sql
SELECT
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
FROM
  "public"."orders"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."users"."id",
  "public"."users"."email",
  "public"."users"."name",
  "public"."users"."role"::text,
  "public"."users"."interests",
  "public"."users"."created_at",
  "public"."users"."updated_at"
FROM
  "public"."users"
WHERE
  "public"."users"."id" IN ($1)
OFFSET
  $2
-- params: ["<userId of the rows above>","0"]

SELECT
  "public"."order_items"."id",
  "public"."order_items"."order_id",
  "public"."order_items"."sku",
  "public"."order_items"."qty",
  "public"."order_items"."price"
FROM
  "public"."order_items"
WHERE
  "public"."order_items"."order_id" IN ($1)
OFFSET
  $2
-- params: ["<id of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.order.findUnique({ where: { id: 1n } });
```

```sql
SELECT
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
FROM
  "public"."orders"
WHERE
  (
    "public"."orders"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["1","1","0"]
```

**create**: Create a row

```ts
await prisma.order.create({ data: { userId: "example", total: "9.99" } });
```

```sql
INSERT INTO
  "public"."orders" ("user_id", "total", "placed_at")
VALUES
  ($1, $2, $3)
RETURNING
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
-- params: ["example","9.99","<now()>"]
```

**update**: Update a row

```ts
await prisma.order.update({ where: { id: 1n }, data: { total: "9.99" } });
```

```sql
UPDATE "public"."orders"
SET
  "total" = $1
WHERE
  (
    "public"."orders"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
-- params: ["9.99","1"]
```

**delete**: Delete a row

```ts
await prisma.order.delete({ where: { id: 1n } });
```

```sql
DELETE FROM "public"."orders"
WHERE
  (
    "public"."orders"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
-- params: ["1"]
```

</details>

<a id="model-OrderItem"></a>

### OrderItem

Table `order_items`. Child of Order with a composite unique constraint.

![OrderItem and the models it relates to](tables/OrderItem.svg)

| Field                  | Type                           | Constraints                         | Default           | Description |
| ---------------------- | ------------------------------ | ----------------------------------- | ----------------- | ----------- |
| `id`                   | `BigInt`                       | PK NOT NULL                         | `autoincrement()` |             |
| `orderId` (`order_id`) | `BigInt`                       | NOT NULL → [Order.id](#model-Order) |                   |             |
| `sku`                  | `String` `@db.VarChar(32)`     | NOT NULL                            |                   |             |
| `qty`                  | `Int`                          | NOT NULL                            | `1`               |             |
| `price`                | `Decimal` `@db.Decimal(12, 2)` | NOT NULL                            |                   |             |

#### Indexes

- `@@unique([orderId, sku])`

#### References

- `orderId` → [Order.id](#model-Order) (many-to-one, on delete Cascade)

#### Definition

```sql
CREATE TABLE "order_items" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "sku" VARCHAR(32) NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_items_order_id_sku_key" ON "order_items"("order_id", "sku");

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.orderItem.findMany();
```

```sql
SELECT
  "public"."order_items"."id",
  "public"."order_items"."order_id",
  "public"."order_items"."sku",
  "public"."order_items"."qty",
  "public"."order_items"."price"
FROM
  "public"."order_items"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.orderItem.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."order_items"."id"
    FROM
      "public"."order_items"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.orderItem.findMany({ include: { order: true } });
```

```sql
SELECT
  "public"."order_items"."id",
  "public"."order_items"."order_id",
  "public"."order_items"."sku",
  "public"."order_items"."qty",
  "public"."order_items"."price"
FROM
  "public"."order_items"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."orders"."id",
  "public"."orders"."user_id",
  "public"."orders"."total",
  "public"."orders"."placed_at"
FROM
  "public"."orders"
WHERE
  "public"."orders"."id" IN ($1)
OFFSET
  $2
-- params: ["<orderId of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.orderItem.findUnique({ where: { id: 1n } });
```

```sql
SELECT
  "public"."order_items"."id",
  "public"."order_items"."order_id",
  "public"."order_items"."sku",
  "public"."order_items"."qty",
  "public"."order_items"."price"
FROM
  "public"."order_items"
WHERE
  (
    "public"."order_items"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["1","1","0"]
```

**create**: Create a row

```ts
await prisma.orderItem.create({ data: { orderId: 1n, sku: "example", price: "9.99" } });
```

```sql
INSERT INTO
  "public"."order_items" ("order_id", "sku", "qty", "price")
VALUES
  ($1, $2, $3, $4)
RETURNING
  "public"."order_items"."id",
  "public"."order_items"."order_id",
  "public"."order_items"."sku",
  "public"."order_items"."qty",
  "public"."order_items"."price"
-- params: ["1","example","1","9.99"]
```

**update**: Update a row

```ts
await prisma.orderItem.update({ where: { id: 1n }, data: { sku: "example" } });
```

```sql
UPDATE "public"."order_items"
SET
  "sku" = $1
WHERE
  (
    "public"."order_items"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."order_items"."id",
  "public"."order_items"."order_id",
  "public"."order_items"."sku",
  "public"."order_items"."qty",
  "public"."order_items"."price"
-- params: ["example","1"]
```

**delete**: Delete a row

```ts
await prisma.orderItem.delete({ where: { id: 1n } });
```

```sql
DELETE FROM "public"."order_items"
WHERE
  (
    "public"."order_items"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."order_items"."id",
  "public"."order_items"."order_id",
  "public"."order_items"."sku",
  "public"."order_items"."qty",
  "public"."order_items"."price"
-- params: ["1"]
```

</details>

<a id="model-AuditLog"></a>

### AuditLog

Table `audit_logs`. DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.

| Field                    | Type                | Constraints | Default                            | Description |
| ------------------------ | ------------------- | ----------- | ---------------------------------- | ----------- |
| `id`                     | `String` `@db.Uuid` | PK NOT NULL | `dbgenerated("gen_random_uuid()")` |             |
| `action`                 | `String`            | NOT NULL    |                                    |             |
| `payload`                | `Json`              | NOT NULL    | `"{}"`                             |             |
| `signature`              | `Bytes`             | NULL        |                                    |             |
| `loggedAt` (`logged_at`) | `DateTime`          | NOT NULL    | `dbgenerated("now()")`             |             |

#### Definition

```sql
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "signature" BYTEA,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.auditLog.findMany();
```

```sql
SELECT
  "public"."audit_logs"."id",
  "public"."audit_logs"."action",
  "public"."audit_logs"."payload",
  "public"."audit_logs"."signature",
  "public"."audit_logs"."logged_at"
FROM
  "public"."audit_logs"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.auditLog.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."audit_logs"."id"
    FROM
      "public"."audit_logs"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.auditLog.findUnique({ where: { id: "example" } });
```

```sql
SELECT
  "public"."audit_logs"."id",
  "public"."audit_logs"."action",
  "public"."audit_logs"."payload",
  "public"."audit_logs"."signature",
  "public"."audit_logs"."logged_at"
FROM
  "public"."audit_logs"
WHERE
  (
    "public"."audit_logs"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["example","1","0"]
```

**create**: Create a row

```ts
await prisma.auditLog.create({ data: { action: "example" } });
```

```sql
INSERT INTO
  "public"."audit_logs" ("action", "payload")
VALUES
  ($1, $2)
RETURNING
  "public"."audit_logs"."id",
  "public"."audit_logs"."action",
  "public"."audit_logs"."payload",
  "public"."audit_logs"."signature",
  "public"."audit_logs"."logged_at"
-- params: ["example","{}"]
```

**update**: Update a row

```ts
await prisma.auditLog.update({ where: { id: "example" }, data: { action: "example" } });
```

```sql
UPDATE "public"."audit_logs"
SET
  "action" = $1
WHERE
  (
    "public"."audit_logs"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."audit_logs"."id",
  "public"."audit_logs"."action",
  "public"."audit_logs"."payload",
  "public"."audit_logs"."signature",
  "public"."audit_logs"."logged_at"
-- params: ["example","example"]
```

**delete**: Delete a row

```ts
await prisma.auditLog.delete({ where: { id: "example" } });
```

```sql
DELETE FROM "public"."audit_logs"
WHERE
  (
    "public"."audit_logs"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."audit_logs"."id",
  "public"."audit_logs"."action",
  "public"."audit_logs"."payload",
  "public"."audit_logs"."signature",
  "public"."audit_logs"."logged_at"
-- params: ["example"]
```

</details>

<a id="model-Actor"></a>

### Actor

Named implicit many-to-many: the join table is `_cast`,
not `_ActorToFilm`.

![Actor and the models it relates to](tables/Actor.svg)

| Field  | Type     | Constraints | Default           | Description |
| ------ | -------- | ----------- | ----------------- | ----------- |
| `id`   | `Int`    | PK NOT NULL | `autoincrement()` |             |
| `name` | `String` | NOT NULL    |                   |             |

#### Many to many

- `films` ↔ [Film.actors](#model-Film) through `_cast`

#### Definition

```sql
CREATE TABLE "Actor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.actor.findMany();
```

```sql
SELECT
  "public"."Actor"."id",
  "public"."Actor"."name"
FROM
  "public"."Actor"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.actor.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."Actor"."id"
    FROM
      "public"."Actor"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.actor.findMany({ include: { films: true } });
```

```sql
SELECT
  "public"."Actor"."id",
  "public"."Actor"."name"
FROM
  "public"."Actor"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."Film"."id",
  "public"."Film"."title",
  "t0"."A" AS "cast@Actor"
FROM
  "public"."Film"
  INNER JOIN "public"."_cast" AS "t0" ON "t0"."B" = "public"."Film"."id"
WHERE
  (
    1 = 1
    AND "t0"."A" IN ($1)
  )
OFFSET
  $2
-- params: ["<id of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.actor.findUnique({ where: { id: 1 } });
```

```sql
SELECT
  "public"."Actor"."id",
  "public"."Actor"."name"
FROM
  "public"."Actor"
WHERE
  (
    "public"."Actor"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["1","1","0"]
```

**create**: Create a row

```ts
await prisma.actor.create({ data: { name: "example" } });
```

```sql
INSERT INTO
  "public"."Actor" ("name")
VALUES
  ($1)
RETURNING
  "public"."Actor"."id",
  "public"."Actor"."name"
-- params: ["example"]
```

**update**: Update a row

```ts
await prisma.actor.update({ where: { id: 1 }, data: { name: "example" } });
```

```sql
UPDATE "public"."Actor"
SET
  "name" = $1
WHERE
  (
    "public"."Actor"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."Actor"."id",
  "public"."Actor"."name"
-- params: ["example","1"]
```

**delete**: Delete a row

```ts
await prisma.actor.delete({ where: { id: 1 } });
```

```sql
DELETE FROM "public"."Actor"
WHERE
  (
    "public"."Actor"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."Actor"."id",
  "public"."Actor"."name"
-- params: ["1"]
```

</details>

<a id="model-Film"></a>

### Film

![Film and the models it relates to](tables/Film.svg)

| Field   | Type     | Constraints | Default           | Description |
| ------- | -------- | ----------- | ----------------- | ----------- |
| `id`    | `Int`    | PK NOT NULL | `autoincrement()` |             |
| `title` | `String` | NOT NULL    |                   |             |

#### Many to many

- `actors` ↔ [Actor.films](#model-Actor) through `_cast`

#### Definition

```sql
CREATE TABLE "Film" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Film_pkey" PRIMARY KEY ("id")
);
```

<details>
<summary>Queries and their SQL</summary>

**findMany**: Every row

```ts
await prisma.film.findMany();
```

```sql
SELECT
  "public"."Film"."id",
  "public"."Film"."title"
FROM
  "public"."Film"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]
```

**count**: How many rows there are

```ts
await prisma.film.count();
```

```sql
SELECT
  COUNT(*) AS "_count$_all"
FROM
  (
    SELECT
      "public"."Film"."id"
    FROM
      "public"."Film"
    WHERE
      1 = 1
    OFFSET
      $1
  ) AS "sub"
-- params: ["0"]
```

**findMany**: Every row with its relations

```ts
await prisma.film.findMany({ include: { actors: true } });
```

```sql
SELECT
  "public"."Film"."id",
  "public"."Film"."title"
FROM
  "public"."Film"
WHERE
  1 = 1
OFFSET
  $1
-- params: ["0"]

SELECT
  "public"."Actor"."id",
  "public"."Actor"."name",
  "t0"."B" AS "cast@Film"
FROM
  "public"."Actor"
  INNER JOIN "public"."_cast" AS "t0" ON "t0"."A" = "public"."Actor"."id"
WHERE
  (
    1 = 1
    AND "t0"."B" IN ($1)
  )
OFFSET
  $2
-- params: ["<id of the rows above>","0"]
```

**findUnique**: One row by what is unique to it

```ts
await prisma.film.findUnique({ where: { id: 1 } });
```

```sql
SELECT
  "public"."Film"."id",
  "public"."Film"."title"
FROM
  "public"."Film"
WHERE
  (
    "public"."Film"."id" = $1
    AND 1 = 1
  )
LIMIT
  $2
OFFSET
  $3
-- params: ["1","1","0"]
```

**create**: Create a row

```ts
await prisma.film.create({ data: { title: "example" } });
```

```sql
INSERT INTO
  "public"."Film" ("title")
VALUES
  ($1)
RETURNING
  "public"."Film"."id",
  "public"."Film"."title"
-- params: ["example"]
```

**update**: Update a row

```ts
await prisma.film.update({ where: { id: 1 }, data: { title: "example" } });
```

```sql
UPDATE "public"."Film"
SET
  "title" = $1
WHERE
  (
    "public"."Film"."id" = $2
    AND 1 = 1
  )
RETURNING
  "public"."Film"."id",
  "public"."Film"."title"
-- params: ["example","1"]
```

**delete**: Delete a row

```ts
await prisma.film.delete({ where: { id: 1 } });
```

```sql
DELETE FROM "public"."Film"
WHERE
  (
    "public"."Film"."id" = $1
    AND 1 = 1
  )
RETURNING
  "public"."Film"."id",
  "public"."Film"."title"
-- params: ["1"]
```

</details>

## Enums

<a id="enum-Role"></a>

### Role

User role. No @map: the value names are stored verbatim.

- `ADMIN`
- `EDITOR`
- `VIEWER`

#### Definition

```sql
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');
```

<a id="enum-Visibility"></a>

### Visibility

Type `visibility_level`. Enum with @map on every value and @@map on the enum itself:
the database stores the mapped values ("link_only"), while
generators receive the Prisma-level names ("LINK_ONLY").

- `PUBLIC` (`public`)
- `PRIVATE` (`private`)
- `LINK_ONLY` (`link_only`)

#### Definition

```sql
CREATE TYPE "visibility_level" AS ENUM ('public', 'private', 'link_only');
```
