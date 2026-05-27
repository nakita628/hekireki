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

export type Organization = typeof OrganizationSchema.Type

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

export type User = typeof UserSchema.Type

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

export type Role = typeof RoleSchema.Type

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

export type Permission = typeof PermissionSchema.Type

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

export type UserRole = typeof UserRoleSchema.Type

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

export type RolePermission = typeof RolePermissionSchema.Type

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

export type AuditLog = typeof AuditLogSchema.Type
