package model

import "time"

type Organization struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name string `gorm:"column:name;type:varchar(200);not null" json:"name"`
	Slug string `gorm:"column:slug;uniqueIndex;type:varchar(100);not null" json:"slug"`
	Status string `gorm:"column:status;default:ACTIVE;not null" json:"status"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	Users []User `gorm:"foreignKey:OrganizationID"`
}

func (Organization) TableName() string {
	return "organizations"
}

type User struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	OrganizationID int `gorm:"column:organization_id;index:idx_organization_id;not null" json:"organization_id"`
	Email string `gorm:"column:email;uniqueIndex;type:varchar(255);not null" json:"email"`
	Name string `gorm:"column:name;type:varchar(100);not null" json:"name"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	Organization Organization
	UserRoles []UserRole `gorm:"foreignKey:UserID"`
	AuditLogs []AuditLog `gorm:"foreignKey:UserID"`
}

func (User) TableName() string {
	return "users"
}

type Role struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name string `gorm:"column:name;uniqueIndex;type:varchar(100);not null" json:"name"`
	Description *string `gorm:"column:description;type:varchar(500)" json:"description"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	UserRoles []UserRole `gorm:"foreignKey:RoleID"`
	RolePermissions []RolePermission `gorm:"foreignKey:RoleID"`
}

func (Role) TableName() string {
	return "roles"
}

type Permission struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Resource string `gorm:"column:resource;uniqueIndex:idx_resource_action_unique;type:varchar(100);not null" json:"resource"`
	Action string `gorm:"column:action;uniqueIndex:idx_resource_action_unique;type:varchar(100);not null" json:"action"`
	Description *string `gorm:"column:description;type:varchar(500)" json:"description"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	RolePermissions []RolePermission `gorm:"foreignKey:PermissionID"`
}

func (Permission) TableName() string {
	return "permissions"
}

type UserRole struct {
	UserID int `gorm:"column:user_id;primaryKey" json:"user_id"`
	RoleID int `gorm:"column:role_id;primaryKey" json:"role_id"`
	AssignedAt time.Time `gorm:"column:assigned_at;autoCreateTime;not null" json:"assigned_at"`
	User User
	Role Role
}

func (UserRole) TableName() string {
	return "user_roles"
}

type RolePermission struct {
	RoleID int `gorm:"column:role_id;primaryKey" json:"role_id"`
	PermissionID int `gorm:"column:permission_id;primaryKey" json:"permission_id"`
	AssignedAt time.Time `gorm:"column:assigned_at;autoCreateTime;not null" json:"assigned_at"`
	Role Role
	Permission Permission
}

func (RolePermission) TableName() string {
	return "role_permissions"
}

type AuditLog struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID int `gorm:"column:user_id;index:idx_user_id;not null" json:"user_id"`
	Action string `gorm:"column:action;type:varchar(50);not null" json:"action"`
	Resource string `gorm:"column:resource;type:varchar(100);not null" json:"resource"`
	Detail *string `gorm:"column:detail" json:"detail"`
	IPAddress *string `gorm:"column:ip_address;type:varchar(45)" json:"ip_address"`
	CreatedAt time.Time `gorm:"column:created_at;index:idx_created_at;autoCreateTime;not null" json:"created_at"`
	User User
}

func (AuditLog) TableName() string {
	return "audit_logs"
}
