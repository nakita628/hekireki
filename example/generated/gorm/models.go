package model

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/nrednav/cuid2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

// NamingStrategy keeps the names Prisma gave its many-to-many join tables
// (`_AToB`, columns `A` and `B`), which GORM would otherwise snake_case,
// pluralise and lowercase. Open the connection with it:
//
//	gorm.Open(dialector, &gorm.Config{NamingStrategy: model.NamingStrategy})
var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}

type User struct {
	ID        string    `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Email     string    `gorm:"column:email;uniqueIndex;not null" json:"email"`
	Name      string    `gorm:"column:name;not null" json:"name"`
	Role      string    `gorm:"column:role;default:'VIEWER';not null" json:"role"`
	Interests []string  `gorm:"column:interests;serializer:json;not null" json:"interests"`
	CreatedAt DateTime  `gorm:"column:created_at;autoCreateTime:false;not null" json:"created_at"`
	UpdatedAt DateTime  `gorm:"column:updated_at;autoUpdateTime:false;not null" json:"updated_at"`
	Posts     []Post    `gorm:"foreignKey:AuthorID;constraint:OnDelete:CASCADE"`
	Comments  []Comment `gorm:"foreignKey:AuthorID;constraint:OnDelete:SET NULL"`
	Orders    []Order   `gorm:"foreignKey:UserID"`
	Followers []Follow  `gorm:"foreignKey:FollowingID;constraint:OnDelete:CASCADE"`
	Following []Follow  `gorm:"foreignKey:FollowerID;constraint:OnDelete:CASCADE"`
	Profile   *Profile  `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

func (User) TableName() string {
	return "users"
}

func (m *User) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.ID == "" {
		m.ID = uuid.Must(uuid.NewV7()).String()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = DateTime{Time: now}
	}
	if m.UpdatedAt.IsZero() {
		m.UpdatedAt = DateTime{Time: now}
	}
	return nil
}

func (*User) BeforeUpdate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if !tx.Statement.Changed("UpdatedAt") {
		tx.Statement.SetColumn("UpdatedAt", DateTime{Time: now})
	}
	return nil
}

type Profile struct {
	ID       string         `gorm:"column:id;primaryKey" json:"id"`
	UserID   string         `gorm:"column:user_id;uniqueIndex;not null" json:"user_id"`
	Bio      *string        `gorm:"column:bio;type:text" json:"bio"`
	Nickname *string        `gorm:"column:nickname;type:varchar(64);default:'anonymous';not null" json:"nickname"`
	Age      *int           `gorm:"column:age;type:smallint" json:"age"`
	Balance  float64        `gorm:"column:balance;type:decimal(10,2);default:0;not null" json:"balance"`
	Verified bool           `gorm:"column:verified;default:false;not null" json:"verified"`
	Meta     datatypes.JSON `gorm:"column:meta" json:"meta"`
	Avatar   []byte         `gorm:"column:avatar" json:"avatar"`
	LastSeen *DateTime      `gorm:"column:last_seen;type:timestamptz(6)" json:"last_seen"`
	User     User
}

func (Profile) TableName() string {
	return "Profile"
}

func (m *Profile) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = cuid2.Generate()
	}
	return nil
}

type Post struct {
	ID         string    `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Title      string    `gorm:"column:title;not null" json:"title"`
	Content    *string   `gorm:"column:content" json:"content"`
	Visibility string    `gorm:"column:visibility;default:'link_only';not null" json:"visibility"`
	Published  bool      `gorm:"column:published;default:false;not null" json:"published"`
	ViewCount  int       `gorm:"column:view_count;default:0;not null" json:"view_count"`
	AuthorID   string    `gorm:"column:author_id;index:posts_author_id_idx;not null" json:"author_id"`
	CreatedAt  DateTime  `gorm:"column:created_at;autoCreateTime:false;not null" json:"created_at"`
	Author     User      `gorm:"foreignKey:AuthorID"`
	Comments   []Comment `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE"`
	Tags       []Tag     `gorm:"many2many:_PostToTag;joinForeignKey:A;joinReferences:B"`
}

func (Post) TableName() string {
	return "posts"
}

func (m *Post) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = DateTime{Time: now}
	}
	return nil
}

type Tag struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Label string `gorm:"column:label;uniqueIndex;not null" json:"label"`
	Posts []Post `gorm:"many2many:_PostToTag;joinForeignKey:B;joinReferences:A"`
}

func (Tag) TableName() string {
	return "Tag"
}

type Comment struct {
	ID        int      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Body      string   `gorm:"column:body;not null" json:"body"`
	PostID    string   `gorm:"column:post_id;index:comments_post_id_created_at_idx;not null" json:"post_id"`
	AuthorID  *string  `gorm:"column:author_id" json:"author_id"`
	CreatedAt DateTime `gorm:"column:created_at;index:comments_post_id_created_at_idx;autoCreateTime:false;not null" json:"created_at"`
	Post      Post
	Author    User `gorm:"foreignKey:AuthorID"`
}

func (Comment) TableName() string {
	return "comments"
}

func (m *Comment) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.CreatedAt.IsZero() {
		m.CreatedAt = DateTime{Time: now}
	}
	return nil
}

type Follow struct {
	FollowerID  string   `gorm:"column:follower_id;primaryKey" json:"follower_id"`
	FollowingID string   `gorm:"column:following_id;primaryKey" json:"following_id"`
	Since       DateTime `gorm:"column:since;not null" json:"since"`
	Follower    User     `gorm:"foreignKey:FollowerID"`
	Following   User     `gorm:"foreignKey:FollowingID"`
}

func (Follow) TableName() string {
	return "follows"
}

func (m *Follow) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.Since.IsZero() {
		m.Since = DateTime{Time: now}
	}
	return nil
}

type Category struct {
	ID       int        `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name     string     `gorm:"column:name;uniqueIndex:Category_parent_id_name_key;not null" json:"name"`
	ParentID *int       `gorm:"column:parent_id;uniqueIndex:Category_parent_id_name_key" json:"parent_id"`
	Parent   *Category  `gorm:"foreignKey:ParentID"`
	Children []Category `gorm:"foreignKey:ParentID"`
}

func (Category) TableName() string {
	return "Category"
}

type Order struct {
	ID       int64    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID   string   `gorm:"column:user_id;not null" json:"user_id"`
	Total    float64  `gorm:"column:total;type:decimal(12,2);not null" json:"total"`
	PlacedAt DateTime `gorm:"column:placed_at;not null" json:"placed_at"`
	User     User
	Items    []OrderItem `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE"`
}

func (Order) TableName() string {
	return "orders"
}

func (m *Order) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.PlacedAt.IsZero() {
		m.PlacedAt = DateTime{Time: now}
	}
	return nil
}

type OrderItem struct {
	ID      int64   `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	OrderID int64   `gorm:"column:order_id;uniqueIndex:order_items_order_id_sku_key;not null" json:"order_id"`
	Sku     string  `gorm:"column:sku;uniqueIndex:order_items_order_id_sku_key;type:varchar(32);not null" json:"sku"`
	Qty     *int    `gorm:"column:qty;default:1;not null" json:"qty"`
	Price   float64 `gorm:"column:price;type:decimal(12,2);not null" json:"price"`
	Order   Order
}

func (OrderItem) TableName() string {
	return "order_items"
}

type AuditLog struct {
	ID        string         `gorm:"column:id;primaryKey;type:char(36);default:gen_random_uuid()" json:"id"`
	Action    string         `gorm:"column:action;not null" json:"action"`
	Payload   datatypes.JSON `gorm:"column:payload;default:'{}';not null" json:"payload"`
	Signature []byte         `gorm:"column:signature" json:"signature"`
	LoggedAt  DateTime       `gorm:"column:logged_at;default:now();not null" json:"logged_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

type Actor struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name  string `gorm:"column:name;not null" json:"name"`
	Films []Film `gorm:"many2many:_cast;joinForeignKey:A;joinReferences:B"`
}

func (Actor) TableName() string {
	return "Actor"
}

type Film struct {
	ID     int     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Title  string  `gorm:"column:title;not null" json:"title"`
	Actors []Actor `gorm:"many2many:_cast;joinForeignKey:B;joinReferences:A"`
}

func (Film) TableName() string {
	return "Film"
}

// DateTime is a Prisma DateTime as Prisma Client keeps it: an instant in UTC, to the
// millisecond, whatever zone the time.Time is in. Bind a time.Time through it in a query of
// your own, `db.Where("at > ?", DateTime{Time: at})`: the driver formats a bare time.Time
// its own way.
type DateTime struct{ time.Time }

// GormDataType has GORM treat the column as it treats a time.Time.
func (DateTime) GormDataType() string {
	return "time"
}

// Value writes the instant in UTC to the millisecond, as Prisma Client does: the wall clock of
// a timestamp column is UTC, and a timestamptz column holds the instant whatever the
// session's time zone.
func (dateTime DateTime) Value() (driver.Value, error) {
	return dateTime.UTC().Truncate(time.Millisecond), nil
}

// Scan reads the column as Prisma Client does (see readPrismaTime).
func (dateTime *DateTime) Scan(src any) error {
	read, err := readPrismaTime(src)
	dateTime.Time = read
	return err
}

// prismaTimeLayouts are the texts readPrismaTime reads, as Prisma Client reads them: with an
// offset or `Z`, or with none, which is UTC; a date alone is midnight UTC.
var prismaTimeLayouts = []string{
	"2006-01-02T15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07",
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02",
}

// readPrismaTime reads a DateTime column as Prisma Client reads it: text with no zone is UTC, an
// offset is kept, digits are milliseconds since 1970, and what is past the millisecond is
// dropped.
func readPrismaTime(src any) (time.Time, error) {
	switch value := src.(type) {
	case nil:
		return time.Time{}, nil
	case time.Time:
		return value.UTC().Truncate(time.Millisecond), nil
	case int64:
		return time.UnixMilli(value).UTC(), nil
	case []byte:
		return readPrismaTime(string(value))
	case string:
		if millis, err := strconv.ParseInt(value, 10, 64); err == nil {
			return time.UnixMilli(millis).UTC(), nil
		}
		for _, layout := range prismaTimeLayouts {
			if read, err := time.Parse(layout, value); err == nil {
				return read.UTC().Truncate(time.Millisecond), nil
			}
		}
		return time.Time{}, fmt.Errorf("a DateTime column held %q", value)
	}
	return time.Time{}, fmt.Errorf("a DateTime column held %T", src)
}
