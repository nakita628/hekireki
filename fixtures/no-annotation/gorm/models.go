package model

import "time"

type User struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Email string `gorm:"column:email;uniqueIndex;not null" json:"email"`
	Name *string `gorm:"column:name" json:"name"`
	Age *int `gorm:"column:age" json:"age"`
	IsActive bool `gorm:"column:is_active;default:true;not null" json:"is_active"`
	Role string `gorm:"column:role;default:MEMBER;not null" json:"role"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	Posts []Post `gorm:"foreignKey:AuthorID"`
	Profile Profile `gorm:"foreignKey:UserID"`
}

type Post struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Title string `gorm:"column:title;not null" json:"title"`
	Content string `gorm:"column:content;not null" json:"content"`
	Published bool `gorm:"column:published;default:false;not null" json:"published"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	AuthorID string `gorm:"column:author_id;not null" json:"author_id"`
	Author User `gorm:"foreignKey:AuthorID"`
	Tags []Tag `gorm:"many2many:_PostToTag;"`
}

type Profile struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Bio *string `gorm:"column:bio" json:"bio"`
	Avatar *string `gorm:"column:avatar" json:"avatar"`
	UserID string `gorm:"column:user_id;uniqueIndex;not null" json:"user_id"`
	User User
}

type Tag struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Name string `gorm:"column:name;uniqueIndex;not null" json:"name"`
	Posts []Post `gorm:"many2many:_PostToTag;"`
}
