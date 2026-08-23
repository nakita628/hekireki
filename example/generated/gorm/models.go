package model

import (
	"time"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type User struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Email string `gorm:"column:email;uniqueIndex;not null" json:"email"`
	Name string `gorm:"column:name;not null" json:"name"`
	Role string `gorm:"column:role;default:'VIEWER';not null" json:"role"`
	Interests []string `gorm:"column:interests;serializer:json;not null" json:"interests"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	Posts []Post `gorm:"foreignKey:AuthorID;constraint:OnDelete:CASCADE"`
	Comments []Comment `gorm:"foreignKey:AuthorID;constraint:OnDelete:SET NULL"`
	Orders []Order `gorm:"foreignKey:UserID"`
	Followers []Follow `gorm:"foreignKey:FollowingID;constraint:OnDelete:CASCADE"`
	Following []Follow `gorm:"foreignKey:FollowerID;constraint:OnDelete:CASCADE"`
	Profile *Profile `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

func (User) TableName() string {
	return "users"
}

func (m *User) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.Must(uuid.NewV7()).String()
	}
	return nil
}

type Profile struct {
	ID string `gorm:"column:id;primaryKey" json:"id"`
	UserID string `gorm:"column:user_id;uniqueIndex;not null" json:"user_id"`
	Bio *string `gorm:"column:bio;type:text" json:"bio"`
	Nickname string `gorm:"column:nickname;type:varchar(64);default:'anonymous';not null" json:"nickname"`
	Age *int `gorm:"column:age;type:smallint" json:"age"`
	Balance float64 `gorm:"column:balance;type:decimal(10,2);default:0;not null" json:"balance"`
	Verified bool `gorm:"column:verified;default:false;not null" json:"verified"`
	Meta datatypes.JSON `gorm:"column:meta" json:"meta"`
	Avatar []byte `gorm:"column:avatar" json:"avatar"`
	LastSeen *time.Time `gorm:"column:last_seen;type:timestamp" json:"last_seen"`
	User User
}

type Post struct {
	ID string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Title string `gorm:"column:title;not null" json:"title"`
	Content *string `gorm:"column:content" json:"content"`
	Visibility string `gorm:"column:visibility;default:'link_only';not null" json:"visibility"`
	Published bool `gorm:"column:published;default:false;not null" json:"published"`
	ViewCount int `gorm:"column:view_count;default:0;not null" json:"view_count"`
	AuthorID string `gorm:"column:author_id;index:idx_posts_author_id;not null" json:"author_id"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	Author User `gorm:"foreignKey:AuthorID"`
	Comments []Comment `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE"`
	Tags []Tag `gorm:"many2many:_PostToTag;"`
}

func (Post) TableName() string {
	return "posts"
}

func (m *Post) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	return nil
}

type Tag struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Label string `gorm:"column:label;uniqueIndex;not null" json:"label"`
	Posts []Post `gorm:"many2many:_PostToTag;"`
}

type Comment struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Body string `gorm:"column:body;not null" json:"body"`
	PostID string `gorm:"column:post_id;index:idx_comments_post_id_created_at;not null" json:"post_id"`
	AuthorID *string `gorm:"column:author_id" json:"author_id"`
	CreatedAt time.Time `gorm:"column:created_at;index:idx_comments_post_id_created_at;autoCreateTime;not null" json:"created_at"`
	Post Post
	Author User `gorm:"foreignKey:AuthorID"`
}

func (Comment) TableName() string {
	return "comments"
}

type Follow struct {
	FollowerID string `gorm:"column:follower_id;primaryKey" json:"follower_id"`
	FollowingID string `gorm:"column:following_id;primaryKey" json:"following_id"`
	Since time.Time `gorm:"column:since;autoCreateTime;not null" json:"since"`
	Follower User `gorm:"foreignKey:FollowerID"`
	Following User `gorm:"foreignKey:FollowingID"`
}

func (Follow) TableName() string {
	return "follows"
}

type Category struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name string `gorm:"column:name;uniqueIndex:idx_category_parent_id_name_unique;not null" json:"name"`
	ParentID *int `gorm:"column:parent_id;uniqueIndex:idx_category_parent_id_name_unique" json:"parent_id"`
	Parent *Category `gorm:"foreignKey:ParentID"`
	Children []Category `gorm:"foreignKey:ParentID"`
}

type Order struct {
	ID int64 `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID string `gorm:"column:user_id;not null" json:"user_id"`
	Total float64 `gorm:"column:total;type:decimal(12,2);not null" json:"total"`
	PlacedAt time.Time `gorm:"column:placed_at;autoCreateTime;not null" json:"placed_at"`
	User User
	Items []OrderItem `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE"`
}

func (Order) TableName() string {
	return "orders"
}

type OrderItem struct {
	ID int64 `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	OrderID int64 `gorm:"column:order_id;uniqueIndex:idx_order_items_order_id_sku_unique;not null" json:"order_id"`
	Sku string `gorm:"column:sku;uniqueIndex:idx_order_items_order_id_sku_unique;type:varchar(32);not null" json:"sku"`
	Qty int `gorm:"column:qty;default:1;not null" json:"qty"`
	Price float64 `gorm:"column:price;type:decimal(12,2);not null" json:"price"`
	Order Order
}

func (OrderItem) TableName() string {
	return "order_items"
}

type AuditLog struct {
	ID string `gorm:"column:id;primaryKey;type:char(36);default:gen_random_uuid()" json:"id"`
	Action string `gorm:"column:action;not null" json:"action"`
	Payload datatypes.JSON `gorm:"column:payload;default:'{}';not null" json:"payload"`
	Signature []byte `gorm:"column:signature" json:"signature"`
	LoggedAt time.Time `gorm:"column:logged_at;default:now();not null" json:"logged_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

type Actor struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name string `gorm:"column:name;not null" json:"name"`
	Films []Film `gorm:"many2many:_cast;"`
}

type Film struct {
	ID int `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Title string `gorm:"column:title;not null" json:"title"`
	Actors []Actor `gorm:"many2many:_cast;"`
}
