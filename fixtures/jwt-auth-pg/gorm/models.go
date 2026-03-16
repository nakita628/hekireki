package model

import "time"

type User struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Email string `gorm:"column:email;uniqueIndex;type:varchar(255);not null" json:"email"`
	PasswordHash *string `gorm:"column:password_hash" json:"password_hash"`
	Name string `gorm:"column:name;type:varchar(100);not null" json:"name"`
	AvatarURL *string `gorm:"column:avatar_url" json:"avatar_url"`
	Role string `gorm:"column:role;default:USER;not null" json:"role"`
	CreditBalance float64 `gorm:"column:credit_balance;type:decimal(10,2);default:0;not null" json:"credit_balance"`
	EmailVerified bool `gorm:"column:email_verified;default:false;not null" json:"email_verified"`
	IsActive bool `gorm:"column:is_active;default:true;not null" json:"is_active"`
	CreatedAt time.Time `gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;type:timestamp;autoUpdateTime;not null" json:"updated_at"`
	LastLoginAt *time.Time `gorm:"column:last_login_at;type:timestamp" json:"last_login_at"`
	OauthAccounts []OAuthAccount `gorm:"foreignKey:UserID"`
	RefreshTokens []RefreshToken `gorm:"foreignKey:UserID"`
	EmailVerifications []EmailVerification `gorm:"foreignKey:UserID"`
	PasswordResets []PasswordReset `gorm:"foreignKey:UserID"`
	TwoFactorSetting TwoFactorSetting `gorm:"foreignKey:UserID"`
}

func (User) TableName() string {
	return "users"
}

type OAuthAccount struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	UserID string `gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"`
	Provider string `gorm:"column:provider;uniqueIndex:idx_provider_provider_account_id_unique;not null" json:"provider"`
	ProviderAccountID string `gorm:"column:provider_account_id;uniqueIndex:idx_provider_provider_account_id_unique;type:varchar(255);not null" json:"provider_account_id"`
	AccessToken *string `gorm:"column:access_token" json:"access_token"`
	RefreshToken *string `gorm:"column:refresh_token" json:"refresh_token"`
	ExpiresAt *time.Time `gorm:"column:expires_at;type:timestamp" json:"expires_at"`
	CreatedAt time.Time `gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"`
	User User
}

func (OAuthAccount) TableName() string {
	return "oauth_accounts"
}

type TwoFactorSetting struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	UserID string `gorm:"column:user_id;uniqueIndex;type:char(36);not null" json:"user_id"`
	Enabled bool `gorm:"column:enabled;default:false;not null" json:"enabled"`
	Method *string `gorm:"column:method" json:"method"`
	TotpSecret *string `gorm:"column:totp_secret" json:"totp_secret"`
	PhoneNumber *string `gorm:"column:phone_number;type:varchar(20)" json:"phone_number"`
	BackupCodes *string `gorm:"column:backup_codes" json:"backup_codes"`
	VerifiedAt *time.Time `gorm:"column:verified_at;type:timestamp" json:"verified_at"`
	CreatedAt time.Time `gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;type:timestamp;autoUpdateTime;not null" json:"updated_at"`
	User User
}

func (TwoFactorSetting) TableName() string {
	return "two_factor_settings"
}

type RefreshToken struct {
	ID string `gorm:"column:id;primaryKey" json:"id"`
	UserID string `gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"`
	TokenHash string `gorm:"column:token_hash;uniqueIndex;not null" json:"token_hash"`
	DeviceInfo *string `gorm:"column:device_info" json:"device_info"`
	IPAddress *string `gorm:"column:ip_address;type:varchar(45)" json:"ip_address"`
	ExpiresAt time.Time `gorm:"column:expires_at;type:timestamp;not null" json:"expires_at"`
	CreatedAt time.Time `gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"`
	Revoked bool `gorm:"column:revoked;default:false;not null" json:"revoked"`
	User User
}

func (RefreshToken) TableName() string {
	return "refresh_tokens"
}

type EmailVerification struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	UserID string `gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"`
	TokenHash string `gorm:"column:token_hash;uniqueIndex;not null" json:"token_hash"`
	ExpiresAt time.Time `gorm:"column:expires_at;type:timestamp;not null" json:"expires_at"`
	CreatedAt time.Time `gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"`
	User User
}

func (EmailVerification) TableName() string {
	return "email_verifications"
}

type PasswordReset struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	UserID string `gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"`
	TokenHash string `gorm:"column:token_hash;uniqueIndex;not null" json:"token_hash"`
	ExpiresAt time.Time `gorm:"column:expires_at;type:timestamp;not null" json:"expires_at"`
	Used bool `gorm:"column:used;default:false;not null" json:"used"`
	CreatedAt time.Time `gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"`
	User User
}

func (PasswordReset) TableName() string {
	return "password_resets"
}
