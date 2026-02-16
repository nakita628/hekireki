import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

export const user = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  bio: text('bio').default(''),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp' }),
  image: text('image'),
  coverImage: text('coverImage'),
  profileImage: text('profileImage'),
  hashedPassword: text('hashedPassword'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$onUpdate(() => new Date()),
  hasNotification: integer('hasNotification', { mode: 'boolean' }).default(false),
})

export const post = sqliteTable('post', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  body: text('body').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$onUpdate(() => new Date()),
  userId: text('userId').notNull(),
})

export const follow = sqliteTable(
  'follow',
  {
    followerId: text('followerId').notNull(),
    followingId: text('followingId').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.followerId, table.followingId] })],
)

export const like = sqliteTable(
  'like',
  {
    userId: text('userId').notNull(),
    postId: text('postId').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.postId] })],
)

export const comment = sqliteTable(
  'comment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    body: text('body').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$onUpdate(() => new Date()),
    userId: text('userId').notNull(),
    postId: text('postId').notNull(),
  },
  (table) => [index('idx_userId').on(table.userId), index('idx_postId').on(table.postId)],
)

export const notification = sqliteTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    body: text('body').notNull(),
    userId: text('userId').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index('idx_userId').on(table.userId)],
)

export const userRelations = relations(user, ({ one, many }) => ({
  posts: many(post),
  comments: many(comment),
  notifications: many(notification),
  followers: many(follow, { relationName: 'Follower' }),
  following: many(follow, { relationName: 'Following' }),
  likes: many(like),
}))

export const postRelations = relations(post, ({ one, many }) => ({
  user: one(user, { fields: [post.userId], references: [user.id] }),
  comments: many(comment),
  likes: many(like),
}))

export const followRelations = relations(follow, ({ one, many }) => ({
  follower: one(user, {
    fields: [follow.followerId],
    references: [user.id],
    relationName: 'Following',
  }),
  following: one(user, {
    fields: [follow.followingId],
    references: [user.id],
    relationName: 'Follower',
  }),
}))

export const likeRelations = relations(like, ({ one, many }) => ({
  user: one(user, { fields: [like.userId], references: [user.id] }),
  post: one(post, { fields: [like.postId], references: [post.id] }),
}))

export const commentRelations = relations(comment, ({ one, many }) => ({
  user: one(user, { fields: [comment.userId], references: [user.id] }),
  post: one(post, { fields: [comment.postId], references: [post.id] }),
}))

export const notificationRelations = relations(notification, ({ one, many }) => ({
  user: one(user, { fields: [notification.userId], references: [user.id] }),
}))
