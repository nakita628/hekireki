package model

import "time"

type User struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Name string `gorm:"column:name;not null" json:"name"`
	Username string `gorm:"column:username;uniqueIndex;not null" json:"username"`
	Bio *string `gorm:"column:bio;default:" json:"bio"`
	Email string `gorm:"column:email;uniqueIndex;not null" json:"email"`
	EmailVerified *time.Time `gorm:"column:email_verified" json:"email_verified"`
	Image *string `gorm:"column:image" json:"image"`
	CoverImage *string `gorm:"column:cover_image" json:"cover_image"`
	ProfileImage *string `gorm:"column:profile_image" json:"profile_image"`
	HashedPassword *string `gorm:"column:hashed_password" json:"hashed_password"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	HasNotification *bool `gorm:"column:has_notification;default:false" json:"has_notification"`
	Posts []Post `gorm:"foreignKey:UserID"`
	Comments []Comment `gorm:"foreignKey:UserID"`
	Notifications []Notification `gorm:"foreignKey:UserID"`
	Followers []Follow `gorm:"foreignKey:FollowingID"`
	Following []Follow `gorm:"foreignKey:FollowerID"`
	Likes []Like `gorm:"foreignKey:UserID"`
}

type Post struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Body string `gorm:"column:body;not null" json:"body"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	UserID string `gorm:"column:user_id;not null" json:"user_id"`
	User User
	Comments []Comment `gorm:"foreignKey:PostID"`
	Likes []Like `gorm:"foreignKey:PostID"`
}

type Follow struct {
	FollowerID string `gorm:"column:follower_id;primaryKey" json:"follower_id"`
	FollowingID string `gorm:"column:following_id;primaryKey" json:"following_id"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	Follower User `gorm:"foreignKey:FollowerID"`
	Following User `gorm:"foreignKey:FollowingID"`
}

type Like struct {
	UserID string `gorm:"column:user_id;primaryKey" json:"user_id"`
	PostID string `gorm:"column:post_id;primaryKey" json:"post_id"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	User User
	Post Post
}

type Comment struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Body string `gorm:"column:body;not null" json:"body"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	UserID string `gorm:"column:user_id;index:idx_user_id;not null" json:"user_id"`
	PostID string `gorm:"column:post_id;index:idx_post_id;not null" json:"post_id"`
	User User
	Post Post
}

type Notification struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Body string `gorm:"column:body;not null" json:"body"`
	UserID string `gorm:"column:user_id;index:idx_user_id;not null" json:"user_id"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	User User
}
