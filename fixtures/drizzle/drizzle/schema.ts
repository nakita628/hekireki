import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

export const role = pgEnum('Role', ['ADMIN', 'USER', 'GUEST'])
export const postStatus = pgEnum('PostStatus', ['DRAFT', 'PUBLISHED', 'ARCHIVED'])

export const user = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  role: role('role').notNull().default('USER'),
  active: boolean('active').notNull().default(true),
  score: numeric('score', { precision: 10, scale: 2 }).notNull().default('0'),
  tags: text('tags').notNull().array(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$onUpdate(() => new Date()),
})

export const profile = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: integer('user_id').notNull().unique(),
  website: text('website'),
  location: varchar('location', { length: 100 }),
  birthDate: date('birth_date'),
})

export const post = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    slug: text('slug').notNull().unique(),
    content: text('content').notNull(),
    status: postStatus('status').notNull().default('DRAFT'),
    views: integer('views').notNull().default(0),
    authorId: integer('author_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_authorId').on(table.authorId),
    index('idx_status_createdAt').on(table.status, table.createdAt),
  ],
)

export const comment = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    body: text('body').notNull(),
    postId: integer('post_id').notNull(),
    authorId: integer('author_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('idx_postId').on(table.postId)],
)

export const tag = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
})

export const postTag = pgTable(
  'post_tags',
  {
    postId: integer('post_id').notNull(),
    tagId: integer('tag_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
)

export const session = pgTable(
  'sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    token: text('token').notNull().unique(),
    userId: integer('user_id').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('idx_userId').on(table.userId), index('idx_expiresAt').on(table.expiresAt)],
)

export const auditLog = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    action: varchar('action', { length: 50 }).notNull(),
    tableName: varchar('table_name', { length: 50 }).notNull(),
    recordId: text('record_id').notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [index('idx_tableName_recordId').on(table.tableName, table.recordId)],
)

export const userRelations = relations(user, ({ one, many }) => ({
  posts: many(post),
  profile: one(profile),
  comments: many(comment),
}))

export const profileRelations = relations(profile, ({ one, many }) => ({
  user: one(user, { fields: [profile.userId], references: [user.id] }),
}))

export const postRelations = relations(post, ({ one, many }) => ({
  author: one(user, { fields: [post.authorId], references: [user.id] }),
  comments: many(comment),
  postTags: many(postTag),
}))

export const commentRelations = relations(comment, ({ one, many }) => ({
  post: one(post, { fields: [comment.postId], references: [post.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}))

export const tagRelations = relations(tag, ({ one, many }) => ({ postTags: many(postTag) }))

export const postTagRelations = relations(postTag, ({ one, many }) => ({
  post: one(post, { fields: [postTag.postId], references: [post.id] }),
  tag: one(tag, { fields: [postTag.tagId], references: [tag.id] }),
}))
