import { Schema } from 'effect'

export const OrganizationSchema = Schema.Struct({
  /**
   * Organization ID
   */
  id: Schema.Int,
  /**
   * Organization name
   */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  /**
   * URL-safe slug
   */
  slug: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /**
   * Organization status
   */
  status: Schema.Literal('ACTIVE', 'INACTIVE', 'SUSPENDED'),
  /**
   * Creation timestamp
   */
  createdAt: Schema.Date,
  /**
   * Last update timestamp
   */
  updatedAt: Schema.Date,
})

export type OrganizationEncoded = typeof OrganizationSchema.Encoded

export const UserSchema = Schema.Struct({
  /**
   * User ID
   */
  id: Schema.Int,
  /**
   * Organization ID
   */
  organizationId: Schema.Int,
  /**
   * Email address
   */
  email: Schema.String,
  /**
   * Display name
   */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /**
   * Creation timestamp
   */
  createdAt: Schema.Date,
  /**
   * Last update timestamp
   */
  updatedAt: Schema.Date,
})

export type UserEncoded = typeof UserSchema.Encoded

export const RoleSchema = Schema.Struct({
  /**
   * Role ID
   */
  id: Schema.Int,
  /**
   * Role name
   */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /**
   * Role description
   */
  description: Schema.NullOr(Schema.String),
  /**
   * Creation timestamp
   */
  createdAt: Schema.Date,
  /**
   * Last update timestamp
   */
  updatedAt: Schema.Date,
})

export type RoleEncoded = typeof RoleSchema.Encoded

export const PermissionSchema = Schema.Struct({
  /**
   * Permission ID
   */
  id: Schema.Int,
  /**
   * Resource name
   */
  resource: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /**
   * Action name
   */
  action: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /**
   * Permission description
   */
  description: Schema.NullOr(Schema.String),
  /**
   * Creation timestamp
   */
  createdAt: Schema.Date,
})

export type PermissionEncoded = typeof PermissionSchema.Encoded

export const UserRoleSchema = Schema.Struct({
  /**
   * User ID
   */
  userId: Schema.Int,
  /**
   * Role ID
   */
  roleId: Schema.Int,
  /**
   * Assignment timestamp
   */
  assignedAt: Schema.Date,
})

export type UserRoleEncoded = typeof UserRoleSchema.Encoded

export const RolePermissionSchema = Schema.Struct({
  /**
   * Role ID
   */
  roleId: Schema.Int,
  /**
   * Permission ID
   */
  permissionId: Schema.Int,
  /**
   * Assignment timestamp
   */
  assignedAt: Schema.Date,
})

export type RolePermissionEncoded = typeof RolePermissionSchema.Encoded

export const AuditLogSchema = Schema.Struct({
  /**
   * Audit log ID
   */
  id: Schema.Int,
  /**
   * User ID
   */
  userId: Schema.Int,
  /**
   * Action performed
   */
  action: Schema.String,
  /**
   * Resource name
   */
  resource: Schema.String,
  /**
   * Action detail
   */
  detail: Schema.NullOr(Schema.String),
  /**
   * Client IP address
   */
  ipAddress: Schema.NullOr(Schema.String),
  /**
   * Action timestamp
   */
  createdAt: Schema.Date,
})

export type AuditLogEncoded = typeof AuditLogSchema.Encoded
