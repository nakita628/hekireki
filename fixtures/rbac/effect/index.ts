import { Schema } from 'effect'

export const OrganizationSchema = Schema.Struct({
  /** Organization ID */
  id: Schema.Int,
  /** Organization name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  /** URL-safe slug */
  slug: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
})

export type Organization = Schema.Schema.Type<typeof OrganizationSchema>

export const UserSchema = Schema.Struct({
  /** User ID */
  id: Schema.Int,
  /** Organization ID */
  organizationId: Schema.Int,
  /** Email address */
  email: Schema.String,
  /** Display name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const RoleSchema = Schema.Struct({
  /** Role ID */
  id: Schema.Int,
  /** Role name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /** Role description */
  description: Schema.NullOr(Schema.String),
})

export type Role = Schema.Schema.Type<typeof RoleSchema>

export const PermissionSchema = Schema.Struct({
  /** Permission ID */
  id: Schema.Int,
  /** Resource name */
  resource: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /** Action name */
  action: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /** Permission description */
  description: Schema.NullOr(Schema.String),
})

export type Permission = Schema.Schema.Type<typeof PermissionSchema>

export const UserRoleSchema = Schema.Struct({
  /** User ID */
  userId: Schema.Int,
  /** Role ID */
  roleId: Schema.Int,
})

export type UserRole = Schema.Schema.Type<typeof UserRoleSchema>

export const RolePermissionSchema = Schema.Struct({
  /** Role ID */
  roleId: Schema.Int,
  /** Permission ID */
  permissionId: Schema.Int,
})

export type RolePermission = Schema.Schema.Type<typeof RolePermissionSchema>

export const AuditLogSchema = Schema.Struct({
  /** Audit log ID */
  id: Schema.Int,
  /** User ID */
  userId: Schema.Int,
  /** Action performed */
  action: Schema.String,
  /** Resource name */
  resource: Schema.String,
  /** Action detail */
  detail: Schema.NullOr(Schema.String),
  /** Client IP address */
  ipAddress: Schema.NullOr(Schema.String),
})

export type AuditLog = Schema.Schema.Type<typeof AuditLogSchema>
