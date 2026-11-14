import { createRoute, z } from '@hono/zod-openapi'

const UserSchema = z
  .object({
    id: z.string().openapi({ description: 'Primary key (UUIDv7)' }),
    email: z.string().openapi({ description: 'Unique login email' }),
    name: z.string().openapi({ description: 'Display name' }),
    role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
    interests: z.array(z.string()),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .openapi({
    required: ['id', 'email', 'name', 'role', 'interests', 'createdAt', 'updatedAt'],
    description:
      'Application user. Fully annotated for every validator generator,\nwith a UUIDv7 primary key, enum default, scalar list, @map columns,\n@updatedAt, and relations of every cardinality.',
  })
  .openapi('User')

const UserCreateSchema = z
  .object({
    id: z.string().exactOptional().openapi({ description: 'Primary key (UUIDv7)' }),
    email: z.string().openapi({ description: 'Unique login email' }),
    name: z.string().openapi({ description: 'Display name' }),
    role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).exactOptional(),
    interests: z.array(z.string()).exactOptional(),
    createdAt: z.iso.datetime({ offset: true }).exactOptional(),
    updatedAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: ['email', 'name'] })
  .openapi('UserCreate')

const UserUpdateSchema = z
  .object({
    email: z.string().exactOptional().openapi({ description: 'Unique login email' }),
    name: z.string().exactOptional().openapi({ description: 'Display name' }),
    role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).exactOptional(),
    interests: z.array(z.string()).exactOptional(),
    createdAt: z.iso.datetime({ offset: true }).exactOptional(),
    updatedAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: [] })
  .openapi('UserUpdate')

const ProfileSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    bio: z.string().nullable(),
    nickname: z.string(),
    age: z.int().nullable(),
    balance: z.string(),
    verified: z.boolean(),
    meta: z.any(),
    avatar: z.string().nullable(),
    lastSeen: z.iso.datetime({ offset: true }).nullable(),
  })
  .openapi({
    required: [
      'id',
      'userId',
      'bio',
      'nickname',
      'age',
      'balance',
      'verified',
      'meta',
      'avatar',
      'lastSeen',
    ],
    description:
      "One-to-one relation with native @db.* types, literal defaults,\nand optional scalars of every flavour. ConfigDict passthrough: the\nPydantic model rejects unknown keys (extra='forbid').",
  })
  .openapi('Profile')

const ProfileCreateSchema = z
  .object({
    id: z.string().exactOptional(),
    userId: z.string(),
    bio: z.string().nullable().exactOptional(),
    nickname: z.string().exactOptional(),
    age: z.int().nullable().exactOptional(),
    balance: z.string().exactOptional(),
    verified: z.boolean().exactOptional(),
    meta: z.any().exactOptional(),
    avatar: z.string().nullable().exactOptional(),
    lastSeen: z.iso.datetime({ offset: true }).nullable().exactOptional(),
  })
  .openapi({ required: ['userId'] })
  .openapi('ProfileCreate')

const ProfileUpdateSchema = z
  .object({
    userId: z.string().exactOptional(),
    bio: z.string().nullable().exactOptional(),
    nickname: z.string().exactOptional(),
    age: z.int().nullable().exactOptional(),
    balance: z.string().exactOptional(),
    verified: z.boolean().exactOptional(),
    meta: z.any().exactOptional(),
    avatar: z.string().nullable().exactOptional(),
    lastSeen: z.iso.datetime({ offset: true }).nullable().exactOptional(),
  })
  .openapi({ required: [] })
  .openapi('ProfileUpdate')

const PostSchema = z
  .object({
    id: z.string().openapi({ description: 'Primary key' }),
    title: z.string().openapi({ description: 'Article title' }),
    content: z.string().nullable(),
    visibility: z.enum(['PUBLIC', 'PRIVATE', 'LINK_ONLY']),
    published: z.boolean(),
    viewCount: z.int(),
    authorId: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .openapi({
    required: [
      'id',
      'title',
      'content',
      'visibility',
      'published',
      'viewCount',
      'authorId',
      'createdAt',
    ],
    description:
      '@@map + @map column names, FK with a referential action,\nmapped-enum default, and an implicit many-to-many to Tag.',
  })
  .openapi('Post')

const PostCreateSchema = z
  .object({
    id: z.string().exactOptional().openapi({ description: 'Primary key' }),
    title: z.string().openapi({ description: 'Article title' }),
    content: z.string().nullable().exactOptional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE', 'LINK_ONLY']).exactOptional(),
    published: z.boolean().exactOptional(),
    viewCount: z.int().exactOptional(),
    authorId: z.string(),
    createdAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: ['title', 'authorId'] })
  .openapi('PostCreate')

const PostUpdateSchema = z
  .object({
    title: z.string().exactOptional().openapi({ description: 'Article title' }),
    content: z.string().nullable().exactOptional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE', 'LINK_ONLY']).exactOptional(),
    published: z.boolean().exactOptional(),
    viewCount: z.int().exactOptional(),
    authorId: z.string().exactOptional(),
    createdAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: [] })
  .openapi('PostUpdate')

const TagSchema = z
  .object({ id: z.int(), label: z.string() })
  .openapi({
    required: ['id', 'label'],
    description: 'Implicit many-to-many partner of Post (join table `_PostToTag`).',
  })
  .openapi('Tag')

const TagCreateSchema = z
  .object({ id: z.int().exactOptional(), label: z.string() })
  .openapi({ required: ['label'] })
  .openapi('TagCreate')

const TagUpdateSchema = z
  .object({ label: z.string().exactOptional() })
  .openapi({ required: [] })
  .openapi('TagUpdate')

const CommentSchema = z
  .object({
    id: z.int(),
    body: z.string(),
    postId: z.string(),
    authorId: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .openapi({
    required: ['id', 'body', 'postId', 'authorId', 'createdAt'],
    description:
      'Two foreign keys with different referential actions\n(Cascade vs SetNull) and a composite index.',
  })
  .openapi('Comment')

const CommentCreateSchema = z
  .object({
    id: z.int().exactOptional(),
    body: z.string(),
    postId: z.string(),
    authorId: z.string().nullable().exactOptional(),
    createdAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: ['body', 'postId'] })
  .openapi('CommentCreate')

const CommentUpdateSchema = z
  .object({
    body: z.string().exactOptional(),
    postId: z.string().exactOptional(),
    authorId: z.string().nullable().exactOptional(),
    createdAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: [] })
  .openapi('CommentUpdate')

const FollowSchema = z
  .object({
    followerId: z.string(),
    followingId: z.string(),
    since: z.iso.datetime({ offset: true }),
  })
  .openapi({
    required: ['followerId', 'followingId', 'since'],
    description: 'Composite primary key + two named relations to the same model.',
  })
  .openapi('Follow')

const FollowCreateSchema = z
  .object({
    followerId: z.string(),
    followingId: z.string(),
    since: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: ['followerId', 'followingId'] })
  .openapi('FollowCreate')

const FollowUpdateSchema = z
  .object({ since: z.iso.datetime({ offset: true }).exactOptional() })
  .openapi({ required: [] })
  .openapi('FollowUpdate')

const CategorySchema = z
  .object({ id: z.int(), name: z.string(), parentId: z.int().nullable() })
  .openapi({
    required: ['id', 'name', 'parentId'],
    description: 'Self-relation (adjacency-list tree) with a composite unique.',
  })
  .openapi('Category')

const CategoryCreateSchema = z
  .object({
    id: z.int().exactOptional(),
    name: z.string(),
    parentId: z.int().nullable().exactOptional(),
  })
  .openapi({ required: ['name'] })
  .openapi('CategoryCreate')

const CategoryUpdateSchema = z
  .object({ name: z.string().exactOptional(), parentId: z.int().nullable().exactOptional() })
  .openapi({ required: [] })
  .openapi('CategoryUpdate')

const OrderSchema = z
  .object({
    id: z.int(),
    userId: z.string(),
    total: z.string(),
    placedAt: z.iso.datetime({ offset: true }),
  })
  .openapi({
    required: ['id', 'userId', 'total', 'placedAt'],
    description: 'BigInt autoincrement primary key (bigserial) and money as Decimal.',
  })
  .openapi('Order')

const OrderCreateSchema = z
  .object({
    id: z.int().exactOptional(),
    userId: z.string(),
    total: z.string(),
    placedAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: ['userId', 'total'] })
  .openapi('OrderCreate')

const OrderUpdateSchema = z
  .object({
    userId: z.string().exactOptional(),
    total: z.string().exactOptional(),
    placedAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: [] })
  .openapi('OrderUpdate')

const OrderItemSchema = z
  .object({ id: z.int(), orderId: z.int(), sku: z.string(), qty: z.int(), price: z.string() })
  .openapi({
    required: ['id', 'orderId', 'sku', 'qty', 'price'],
    description: 'Child of Order with a composite unique constraint.',
  })
  .openapi('OrderItem')

const OrderItemCreateSchema = z
  .object({
    id: z.int().exactOptional(),
    orderId: z.int(),
    sku: z.string(),
    qty: z.int().exactOptional(),
    price: z.string(),
  })
  .openapi({ required: ['orderId', 'sku', 'price'] })
  .openapi('OrderItemCreate')

const OrderItemUpdateSchema = z
  .object({
    orderId: z.int().exactOptional(),
    sku: z.string().exactOptional(),
    qty: z.int().exactOptional(),
    price: z.string().exactOptional(),
  })
  .openapi({ required: [] })
  .openapi('OrderItemUpdate')

const AuditLogSchema = z
  .object({
    id: z.string(),
    action: z.string(),
    payload: z.any(),
    signature: z.string().nullable(),
    loggedAt: z.iso.datetime({ offset: true }),
  })
  .openapi({
    required: ['id', 'action', 'payload', 'signature', 'loggedAt'],
    description: 'DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.',
  })
  .openapi('AuditLog')

const AuditLogCreateSchema = z
  .object({
    id: z.string().exactOptional(),
    action: z.string(),
    payload: z.any().exactOptional(),
    signature: z.string().nullable().exactOptional(),
    loggedAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: ['action'] })
  .openapi('AuditLogCreate')

const AuditLogUpdateSchema = z
  .object({
    action: z.string().exactOptional(),
    payload: z.any().exactOptional(),
    signature: z.string().nullable().exactOptional(),
    loggedAt: z.iso.datetime({ offset: true }).exactOptional(),
  })
  .openapi({ required: [] })
  .openapi('AuditLogUpdate')

const ActorSchema = z
  .object({ id: z.int(), name: z.string() })
  .openapi({
    required: ['id', 'name'],
    description: 'Named implicit many-to-many: the join table is `_cast`,\nnot `_ActorToFilm`.',
  })
  .openapi('Actor')

const ActorCreateSchema = z
  .object({ id: z.int().exactOptional(), name: z.string() })
  .openapi({ required: ['name'] })
  .openapi('ActorCreate')

const ActorUpdateSchema = z
  .object({ name: z.string().exactOptional() })
  .openapi({ required: [] })
  .openapi('ActorUpdate')

const FilmSchema = z
  .object({ id: z.int(), title: z.string() })
  .openapi({ required: ['id', 'title'] })
  .openapi('Film')

const FilmCreateSchema = z
  .object({ id: z.int().exactOptional(), title: z.string() })
  .openapi({ required: ['title'] })
  .openapi('FilmCreate')

const FilmUpdateSchema = z
  .object({ title: z.string().exactOptional() })
  .openapi({ required: [] })
  .openapi('FilmUpdate')

const BearerAuthSecurityScheme = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }

export const getUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  tags: ['User'],
  summary: 'List users',
  operationId: 'listUsers',
  responses: {
    200: {
      description: 'The users.',
      content: { 'application/json': { schema: z.array(UserSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postUsersRoute = createRoute({
  method: 'post',
  path: '/users',
  tags: ['User'],
  summary: 'Create an user',
  operationId: 'createUser',
  request: {
    body: { content: { 'application/json': { schema: UserCreateSchema } }, required: true },
  },
  responses: {
    201: { description: 'The user made.', content: { 'application/json': { schema: UserSchema } } },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getUsersIdRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  tags: ['User'],
  summary: 'Get an user',
  operationId: 'getUser',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    200: { description: 'The user.', content: { 'application/json': { schema: UserSchema } } },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No user has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteUsersIdRoute = createRoute({
  method: 'delete',
  path: '/users/{id}',
  tags: ['User'],
  summary: 'Delete an user',
  operationId: 'deleteUser',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    204: { description: 'The user is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No user has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchUsersIdRoute = createRoute({
  method: 'patch',
  path: '/users/{id}',
  tags: ['User'],
  summary: 'Update an user',
  operationId: 'updateUser',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
    body: { content: { 'application/json': { schema: UserUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The user changed.',
      content: { 'application/json': { schema: UserSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No user has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getProfilesRoute = createRoute({
  method: 'get',
  path: '/profiles',
  tags: ['Profile'],
  summary: 'List profiles',
  operationId: 'listProfiles',
  responses: {
    200: {
      description: 'The profiles.',
      content: { 'application/json': { schema: z.array(ProfileSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postProfilesRoute = createRoute({
  method: 'post',
  path: '/profiles',
  tags: ['Profile'],
  summary: 'Create a profile',
  operationId: 'createProfile',
  request: {
    body: { content: { 'application/json': { schema: ProfileCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The profile made.',
      content: { 'application/json': { schema: ProfileSchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getProfilesIdRoute = createRoute({
  method: 'get',
  path: '/profiles/{id}',
  tags: ['Profile'],
  summary: 'Get a profile',
  operationId: 'getProfile',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    200: {
      description: 'The profile.',
      content: { 'application/json': { schema: ProfileSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No profile has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteProfilesIdRoute = createRoute({
  method: 'delete',
  path: '/profiles/{id}',
  tags: ['Profile'],
  summary: 'Delete a profile',
  operationId: 'deleteProfile',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    204: { description: 'The profile is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No profile has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchProfilesIdRoute = createRoute({
  method: 'patch',
  path: '/profiles/{id}',
  tags: ['Profile'],
  summary: 'Update a profile',
  operationId: 'updateProfile',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
    body: { content: { 'application/json': { schema: ProfileUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The profile changed.',
      content: { 'application/json': { schema: ProfileSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No profile has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getPostsRoute = createRoute({
  method: 'get',
  path: '/posts',
  tags: ['Post'],
  summary: 'List posts',
  operationId: 'listPosts',
  responses: {
    200: {
      description: 'The posts.',
      content: { 'application/json': { schema: z.array(PostSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postPostsRoute = createRoute({
  method: 'post',
  path: '/posts',
  tags: ['Post'],
  summary: 'Create a post',
  operationId: 'createPost',
  request: {
    body: { content: { 'application/json': { schema: PostCreateSchema } }, required: true },
  },
  responses: {
    201: { description: 'The post made.', content: { 'application/json': { schema: PostSchema } } },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getPostsIdRoute = createRoute({
  method: 'get',
  path: '/posts/{id}',
  tags: ['Post'],
  summary: 'Get a post',
  operationId: 'getPost',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    200: { description: 'The post.', content: { 'application/json': { schema: PostSchema } } },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No post has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deletePostsIdRoute = createRoute({
  method: 'delete',
  path: '/posts/{id}',
  tags: ['Post'],
  summary: 'Delete a post',
  operationId: 'deletePost',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    204: { description: 'The post is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No post has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchPostsIdRoute = createRoute({
  method: 'patch',
  path: '/posts/{id}',
  tags: ['Post'],
  summary: 'Update a post',
  operationId: 'updatePost',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
    body: { content: { 'application/json': { schema: PostUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The post changed.',
      content: { 'application/json': { schema: PostSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No post has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getTagsRoute = createRoute({
  method: 'get',
  path: '/tags',
  tags: ['Tag'],
  summary: 'List tags',
  operationId: 'listTags',
  responses: {
    200: {
      description: 'The tags.',
      content: { 'application/json': { schema: z.array(TagSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postTagsRoute = createRoute({
  method: 'post',
  path: '/tags',
  tags: ['Tag'],
  summary: 'Create a tag',
  operationId: 'createTag',
  request: {
    body: { content: { 'application/json': { schema: TagCreateSchema } }, required: true },
  },
  responses: {
    201: { description: 'The tag made.', content: { 'application/json': { schema: TagSchema } } },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getTagsIdRoute = createRoute({
  method: 'get',
  path: '/tags/{id}',
  tags: ['Tag'],
  summary: 'Get a tag',
  operationId: 'getTag',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    200: { description: 'The tag.', content: { 'application/json': { schema: TagSchema } } },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No tag has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteTagsIdRoute = createRoute({
  method: 'delete',
  path: '/tags/{id}',
  tags: ['Tag'],
  summary: 'Delete a tag',
  operationId: 'deleteTag',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The tag is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No tag has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchTagsIdRoute = createRoute({
  method: 'patch',
  path: '/tags/{id}',
  tags: ['Tag'],
  summary: 'Update a tag',
  operationId: 'updateTag',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
    body: { content: { 'application/json': { schema: TagUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The tag changed.',
      content: { 'application/json': { schema: TagSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No tag has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getCommentsRoute = createRoute({
  method: 'get',
  path: '/comments',
  tags: ['Comment'],
  summary: 'List comments',
  operationId: 'listComments',
  responses: {
    200: {
      description: 'The comments.',
      content: { 'application/json': { schema: z.array(CommentSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postCommentsRoute = createRoute({
  method: 'post',
  path: '/comments',
  tags: ['Comment'],
  summary: 'Create a comment',
  operationId: 'createComment',
  request: {
    body: { content: { 'application/json': { schema: CommentCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The comment made.',
      content: { 'application/json': { schema: CommentSchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getCommentsIdRoute = createRoute({
  method: 'get',
  path: '/comments/{id}',
  tags: ['Comment'],
  summary: 'Get a comment',
  operationId: 'getComment',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    200: {
      description: 'The comment.',
      content: { 'application/json': { schema: CommentSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No comment has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteCommentsIdRoute = createRoute({
  method: 'delete',
  path: '/comments/{id}',
  tags: ['Comment'],
  summary: 'Delete a comment',
  operationId: 'deleteComment',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The comment is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No comment has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchCommentsIdRoute = createRoute({
  method: 'patch',
  path: '/comments/{id}',
  tags: ['Comment'],
  summary: 'Update a comment',
  operationId: 'updateComment',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
    body: { content: { 'application/json': { schema: CommentUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The comment changed.',
      content: { 'application/json': { schema: CommentSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No comment has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getFollowsRoute = createRoute({
  method: 'get',
  path: '/follows',
  tags: ['Follow'],
  summary: 'List follows',
  operationId: 'listFollows',
  responses: {
    200: {
      description: 'The follows.',
      content: { 'application/json': { schema: z.array(FollowSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postFollowsRoute = createRoute({
  method: 'post',
  path: '/follows',
  tags: ['Follow'],
  summary: 'Create a follow',
  operationId: 'createFollow',
  request: {
    body: { content: { 'application/json': { schema: FollowCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The follow made.',
      content: { 'application/json': { schema: FollowSchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getFollowsFollowerIdFollowingIdRoute = createRoute({
  method: 'get',
  path: '/follows/{followerId}/{followingId}',
  tags: ['Follow'],
  summary: 'Get a follow',
  operationId: 'getFollow',
  request: {
    params: z.object({
      followerId: z
        .string()
        .openapi({
          param: { name: 'followerId', in: 'path', required: true, schema: { type: 'string' } },
        }),
      followingId: z
        .string()
        .openapi({
          param: { name: 'followingId', in: 'path', required: true, schema: { type: 'string' } },
        }),
    }),
  },
  responses: {
    200: { description: 'The follow.', content: { 'application/json': { schema: FollowSchema } } },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No follow has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteFollowsFollowerIdFollowingIdRoute = createRoute({
  method: 'delete',
  path: '/follows/{followerId}/{followingId}',
  tags: ['Follow'],
  summary: 'Delete a follow',
  operationId: 'deleteFollow',
  request: {
    params: z.object({
      followerId: z
        .string()
        .openapi({
          param: { name: 'followerId', in: 'path', required: true, schema: { type: 'string' } },
        }),
      followingId: z
        .string()
        .openapi({
          param: { name: 'followingId', in: 'path', required: true, schema: { type: 'string' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The follow is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No follow has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchFollowsFollowerIdFollowingIdRoute = createRoute({
  method: 'patch',
  path: '/follows/{followerId}/{followingId}',
  tags: ['Follow'],
  summary: 'Update a follow',
  operationId: 'updateFollow',
  request: {
    params: z.object({
      followerId: z
        .string()
        .openapi({
          param: { name: 'followerId', in: 'path', required: true, schema: { type: 'string' } },
        }),
      followingId: z
        .string()
        .openapi({
          param: { name: 'followingId', in: 'path', required: true, schema: { type: 'string' } },
        }),
    }),
    body: { content: { 'application/json': { schema: FollowUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The follow changed.',
      content: { 'application/json': { schema: FollowSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No follow has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getCategoriesRoute = createRoute({
  method: 'get',
  path: '/categories',
  tags: ['Category'],
  summary: 'List categories',
  operationId: 'listCategories',
  responses: {
    200: {
      description: 'The categories.',
      content: { 'application/json': { schema: z.array(CategorySchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postCategoriesRoute = createRoute({
  method: 'post',
  path: '/categories',
  tags: ['Category'],
  summary: 'Create a category',
  operationId: 'createCategory',
  request: {
    body: { content: { 'application/json': { schema: CategoryCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The category made.',
      content: { 'application/json': { schema: CategorySchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getCategoriesIdRoute = createRoute({
  method: 'get',
  path: '/categories/{id}',
  tags: ['Category'],
  summary: 'Get a category',
  operationId: 'getCategory',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    200: {
      description: 'The category.',
      content: { 'application/json': { schema: CategorySchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No category has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteCategoriesIdRoute = createRoute({
  method: 'delete',
  path: '/categories/{id}',
  tags: ['Category'],
  summary: 'Delete a category',
  operationId: 'deleteCategory',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The category is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No category has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchCategoriesIdRoute = createRoute({
  method: 'patch',
  path: '/categories/{id}',
  tags: ['Category'],
  summary: 'Update a category',
  operationId: 'updateCategory',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
    body: { content: { 'application/json': { schema: CategoryUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The category changed.',
      content: { 'application/json': { schema: CategorySchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No category has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getOrdersRoute = createRoute({
  method: 'get',
  path: '/orders',
  tags: ['Order'],
  summary: 'List orders',
  operationId: 'listOrders',
  responses: {
    200: {
      description: 'The orders.',
      content: { 'application/json': { schema: z.array(OrderSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postOrdersRoute = createRoute({
  method: 'post',
  path: '/orders',
  tags: ['Order'],
  summary: 'Create an order',
  operationId: 'createOrder',
  request: {
    body: { content: { 'application/json': { schema: OrderCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The order made.',
      content: { 'application/json': { schema: OrderSchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getOrdersIdRoute = createRoute({
  method: 'get',
  path: '/orders/{id}',
  tags: ['Order'],
  summary: 'Get an order',
  operationId: 'getOrder',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    200: { description: 'The order.', content: { 'application/json': { schema: OrderSchema } } },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No order has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteOrdersIdRoute = createRoute({
  method: 'delete',
  path: '/orders/{id}',
  tags: ['Order'],
  summary: 'Delete an order',
  operationId: 'deleteOrder',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The order is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No order has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchOrdersIdRoute = createRoute({
  method: 'patch',
  path: '/orders/{id}',
  tags: ['Order'],
  summary: 'Update an order',
  operationId: 'updateOrder',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
    body: { content: { 'application/json': { schema: OrderUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The order changed.',
      content: { 'application/json': { schema: OrderSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No order has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getOrderItemsRoute = createRoute({
  method: 'get',
  path: '/order-items',
  tags: ['OrderItem'],
  summary: 'List order items',
  operationId: 'listOrderItems',
  responses: {
    200: {
      description: 'The order items.',
      content: { 'application/json': { schema: z.array(OrderItemSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postOrderItemsRoute = createRoute({
  method: 'post',
  path: '/order-items',
  tags: ['OrderItem'],
  summary: 'Create an order item',
  operationId: 'createOrderItem',
  request: {
    body: { content: { 'application/json': { schema: OrderItemCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The order item made.',
      content: { 'application/json': { schema: OrderItemSchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getOrderItemsIdRoute = createRoute({
  method: 'get',
  path: '/order-items/{id}',
  tags: ['OrderItem'],
  summary: 'Get an order item',
  operationId: 'getOrderItem',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    200: {
      description: 'The order item.',
      content: { 'application/json': { schema: OrderItemSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No order item has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteOrderItemsIdRoute = createRoute({
  method: 'delete',
  path: '/order-items/{id}',
  tags: ['OrderItem'],
  summary: 'Delete an order item',
  operationId: 'deleteOrderItem',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The order item is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No order item has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchOrderItemsIdRoute = createRoute({
  method: 'patch',
  path: '/order-items/{id}',
  tags: ['OrderItem'],
  summary: 'Update an order item',
  operationId: 'updateOrderItem',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
    body: { content: { 'application/json': { schema: OrderItemUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The order item changed.',
      content: { 'application/json': { schema: OrderItemSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No order item has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getAuditLogsRoute = createRoute({
  method: 'get',
  path: '/audit-logs',
  tags: ['AuditLog'],
  summary: 'List audit logs',
  operationId: 'listAuditLogs',
  responses: {
    200: {
      description: 'The audit logs.',
      content: { 'application/json': { schema: z.array(AuditLogSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postAuditLogsRoute = createRoute({
  method: 'post',
  path: '/audit-logs',
  tags: ['AuditLog'],
  summary: 'Create an audit log',
  operationId: 'createAuditLog',
  request: {
    body: { content: { 'application/json': { schema: AuditLogCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The audit log made.',
      content: { 'application/json': { schema: AuditLogSchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getAuditLogsIdRoute = createRoute({
  method: 'get',
  path: '/audit-logs/{id}',
  tags: ['AuditLog'],
  summary: 'Get an audit log',
  operationId: 'getAuditLog',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    200: {
      description: 'The audit log.',
      content: { 'application/json': { schema: AuditLogSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No audit log has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteAuditLogsIdRoute = createRoute({
  method: 'delete',
  path: '/audit-logs/{id}',
  tags: ['AuditLog'],
  summary: 'Delete an audit log',
  operationId: 'deleteAuditLog',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
  },
  responses: {
    204: { description: 'The audit log is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No audit log has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchAuditLogsIdRoute = createRoute({
  method: 'patch',
  path: '/audit-logs/{id}',
  tags: ['AuditLog'],
  summary: 'Update an audit log',
  operationId: 'updateAuditLog',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ param: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } }),
    }),
    body: { content: { 'application/json': { schema: AuditLogUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The audit log changed.',
      content: { 'application/json': { schema: AuditLogSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No audit log has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getActorsRoute = createRoute({
  method: 'get',
  path: '/actors',
  tags: ['Actor'],
  summary: 'List actors',
  operationId: 'listActors',
  responses: {
    200: {
      description: 'The actors.',
      content: { 'application/json': { schema: z.array(ActorSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postActorsRoute = createRoute({
  method: 'post',
  path: '/actors',
  tags: ['Actor'],
  summary: 'Create an actor',
  operationId: 'createActor',
  request: {
    body: { content: { 'application/json': { schema: ActorCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'The actor made.',
      content: { 'application/json': { schema: ActorSchema } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getActorsIdRoute = createRoute({
  method: 'get',
  path: '/actors/{id}',
  tags: ['Actor'],
  summary: 'Get an actor',
  operationId: 'getActor',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    200: { description: 'The actor.', content: { 'application/json': { schema: ActorSchema } } },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No actor has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteActorsIdRoute = createRoute({
  method: 'delete',
  path: '/actors/{id}',
  tags: ['Actor'],
  summary: 'Delete an actor',
  operationId: 'deleteActor',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The actor is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No actor has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchActorsIdRoute = createRoute({
  method: 'patch',
  path: '/actors/{id}',
  tags: ['Actor'],
  summary: 'Update an actor',
  operationId: 'updateActor',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
    body: { content: { 'application/json': { schema: ActorUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The actor changed.',
      content: { 'application/json': { schema: ActorSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No actor has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getFilmsRoute = createRoute({
  method: 'get',
  path: '/films',
  tags: ['Film'],
  summary: 'List films',
  operationId: 'listFilms',
  responses: {
    200: {
      description: 'The films.',
      content: { 'application/json': { schema: z.array(FilmSchema) } },
    },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const postFilmsRoute = createRoute({
  method: 'post',
  path: '/films',
  tags: ['Film'],
  summary: 'Create a film',
  operationId: 'createFilm',
  request: {
    body: { content: { 'application/json': { schema: FilmCreateSchema } }, required: true },
  },
  responses: {
    201: { description: 'The film made.', content: { 'application/json': { schema: FilmSchema } } },
    401: { description: 'No valid bearer token.' },
  },
  security: [{ bearerAuth: [] }],
})

export const getFilmsIdRoute = createRoute({
  method: 'get',
  path: '/films/{id}',
  tags: ['Film'],
  summary: 'Get a film',
  operationId: 'getFilm',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    200: { description: 'The film.', content: { 'application/json': { schema: FilmSchema } } },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No film has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const deleteFilmsIdRoute = createRoute({
  method: 'delete',
  path: '/films/{id}',
  tags: ['Film'],
  summary: 'Delete a film',
  operationId: 'deleteFilm',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
  },
  responses: {
    204: { description: 'The film is deleted.' },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No film has this key.' },
  },
  security: [{ bearerAuth: [] }],
})

export const patchFilmsIdRoute = createRoute({
  method: 'patch',
  path: '/films/{id}',
  tags: ['Film'],
  summary: 'Update a film',
  operationId: 'updateFilm',
  request: {
    params: z.object({
      id: z
        .preprocess(
          (val) =>
            typeof val === 'string' &&
            /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(val) &&
            (!/^-?\d+$/.test(val) || Number.isSafeInteger(Number(val)))
              ? Number(val)
              : val,
          z.int(),
        )
        .openapi({
          param: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        }),
    }),
    body: { content: { 'application/json': { schema: FilmUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The film changed.',
      content: { 'application/json': { schema: FilmSchema } },
    },
    401: { description: 'No valid bearer token.' },
    404: { description: 'No film has this key.' },
  },
  security: [{ bearerAuth: [] }],
})
