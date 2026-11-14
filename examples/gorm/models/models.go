package models

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/lucsky/cuid"
	gonanoid "github.com/matoous/go-nanoid/v2"
	"github.com/nrednav/cuid2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}

// A person who writes. `active` defaults to true, which is not Go's zero value: a user made
// inactive on purpose has to stay inactive, not take the default because false looked unset.
type User struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Email string `gorm:"column:email;uniqueIndex;not null" json:"email"`
	// Optional, so a pointer: nil is NULL, not "".
	DisplayName *string   `gorm:"column:display_name" json:"display_name"`
	Role        string    `gorm:"column:role;default:'member';not null" json:"role"`
	Active      *bool     `gorm:"column:active;default:true;not null" json:"active"`
	CreatedAt   DateTime  `gorm:"column:created_at;autoCreateTime:false;not null" json:"created_at"`
	UpdatedAt   DateTime  `gorm:"column:updated_at;autoUpdateTime:false;not null" json:"updated_at"`
	Posts       []Post    `gorm:"foreignKey:AuthorID;constraint:OnDelete:SET NULL"`
	Comments    []Comment `gorm:"foreignKey:AuthorID;constraint:OnDelete:RESTRICT"`
	// Both sides of a self many-to-many written out as a model: who follows whom.
	Following []Follow   `gorm:"foreignKey:FollowerID;constraint:OnDelete:CASCADE"`
	Followers []Follow   `gorm:"foreignKey:FolloweeID;constraint:OnDelete:CASCADE"`
	AuditLogs []AuditLog `gorm:"foreignKey:UserEmail;references:Email;constraint:OnUpdate:CASCADE,OnDelete:NO ACTION"`
	Profile   *Profile   `gorm:"foreignKey:OwnerID;constraint:OnDelete:CASCADE"`
}

func (User) TableName() string {
	return "users"
}

func (m *User) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
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

// One per user, and gone with the user. The relation field is named after the model, `user`,
// while its key is `ownerId`: GORM's own guess would be `UserID`, so the key has to be named.
// `websiteURL` is a Go initialism as a person writes it in camelCase.
type Profile struct {
	ID         int     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	OwnerID    int     `gorm:"column:owner_id;uniqueIndex;not null" json:"owner_id"`
	Bio        *string `gorm:"column:bio" json:"bio"`
	WebsiteURL *string `gorm:"column:website_url" json:"website_url"`
	// A picture as bytes: a nil slice is NULL.
	Avatar []byte `gorm:"column:avatar" json:"avatar"`
	User   *User  `gorm:"foreignKey:OwnerID"`
}

func (Profile) TableName() string {
	return "profiles"
}

// The key the posts of a deleted category fall back to: row 1, which the check creates first.
type Category struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name  string `gorm:"column:name;uniqueIndex;not null" json:"name"`
	Posts []Post `gorm:"foreignKey:CategoryID;constraint:OnDelete:SET DEFAULT"`
}

func (Category) TableName() string {
	return "categories"
}

// Every onDelete a relation of a post can take, one per foreign key: the author may go and leave
// the post (SetNull), the category may go and hand the post to the default one (SetDefault).
type Post struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Title string `gorm:"column:title;not null" json:"title"`
	// A non-empty default: "" set on purpose must be stored as "", not replaced by it.
	Slug       *string  `gorm:"column:slug;default:'untitled';not null" json:"slug"`
	Status     string   `gorm:"column:status;index:posts_author_id_status_idx;default:'DRAFT';not null" json:"status"`
	Views      int      `gorm:"column:views;default:0;not null" json:"views"`
	AuthorID   *int     `gorm:"column:author_id;index:posts_author_id_status_idx" json:"author_id"`
	CategoryID *int     `gorm:"column:category_id;default:1;not null" json:"category_id"`
	CreatedAt  DateTime `gorm:"column:created_at;autoCreateTime:false;not null" json:"created_at"`
	UpdatedAt  DateTime `gorm:"column:updated_at;autoUpdateTime:false;not null" json:"updated_at"`
	Author     *User    `gorm:"foreignKey:AuthorID"`
	Category   *Category
	Comments   []Comment `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE"`
	// An implicit many-to-many: Prisma's own join table, _PostToTag, with columns A (Post) and B
	// (Tag), named after the models in alphabetical order.
	Tags []Tag `gorm:"many2many:_PostToTag;joinForeignKey:A;joinReferences:B"`
}

func (Post) TableName() string {
	return "posts"
}

func (m *Post) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.CreatedAt.IsZero() {
		m.CreatedAt = DateTime{Time: now}
	}
	if m.UpdatedAt.IsZero() {
		m.UpdatedAt = DateTime{Time: now}
	}
	return nil
}

func (*Post) BeforeUpdate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if !tx.Statement.Changed("UpdatedAt") {
		tx.Statement.SetColumn("UpdatedAt", DateTime{Time: now})
	}
	return nil
}

// A random primary key made by the client: `uuid()` is not a database default, so the struct
// has to make one before it is inserted.
type Tag struct {
	ID    string `gorm:"column:id;primaryKey;type:char(36)" json:"id"`
	Name  string `gorm:"column:name;uniqueIndex;not null" json:"name"`
	Posts []Post `gorm:"many2many:_PostToTag;joinForeignKey:B;joinReferences:A"`
}

func (Tag) TableName() string {
	return "tags"
}

func (m *Tag) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	return nil
}

// A `cuid()` key, a self relation for replies, and a unique pair: a comment's `slot` is unique
// within its post. The author cannot be deleted while a comment of theirs stands (Restrict).
type Comment struct {
	ID       string  `gorm:"column:id;primaryKey" json:"id"`
	Body     string  `gorm:"column:body;not null" json:"body"`
	Slot     int     `gorm:"column:slot;uniqueIndex:comments_post_id_slot_key;not null" json:"slot"`
	PostID   int     `gorm:"column:post_id;uniqueIndex:comments_post_id_slot_key;not null" json:"post_id"`
	AuthorID int     `gorm:"column:author_id;not null" json:"author_id"`
	ParentID *string `gorm:"column:parent_id" json:"parent_id"`
	Post     *Post
	Author   *User     `gorm:"foreignKey:AuthorID"`
	Parent   *Comment  `gorm:"foreignKey:ParentID"`
	Replies  []Comment `gorm:"foreignKey:ParentID;constraint:OnDelete:SET NULL"`
}

func (Comment) TableName() string {
	return "comments"
}

func (m *Comment) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = cuid.New()
	}
	return nil
}

// A composite primary key, and the join model of an explicit self many-to-many: two relations
// to the same model, each named, each gone with either user.
type Follow struct {
	FollowerID int      `gorm:"column:follower_id;primaryKey" json:"follower_id"`
	FolloweeID int      `gorm:"column:followee_id;primaryKey" json:"followee_id"`
	Since      DateTime `gorm:"column:since;not null" json:"since"`
	Follower   *User    `gorm:"foreignKey:FollowerID"`
	Followee   *User    `gorm:"foreignKey:FolloweeID"`
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

// A relation to a unique column that is not the key: the log names the user by address.
// NoAction keeps a user with log lines from going; a changed address follows into the log
// (onUpdate: Cascade). The key is an Int: on SQLite, Prisma writes a BigInt autoincrement key as
// `BIGINT PRIMARY KEY`, which is not the rowid, so the database never fills it.
type AuditLog struct {
	ID        int      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserEmail string   `gorm:"column:user_email;not null" json:"user_email"`
	Action    string   `gorm:"column:action;not null" json:"action"`
	At        DateTime `gorm:"column:at;not null" json:"at"`
	User      *User    `gorm:"references:Email"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

func (m *AuditLog) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.At.IsZero() {
		m.At = DateTime{Time: now}
	}
	return nil
}

// The two client-made keys Go needs a library for: a `cuid(2)` primary key and a `nanoid(8)`
// column beside it, which is not a key at all and is made all the same.
type Invite struct {
	ID        string    `gorm:"column:id;primaryKey" json:"id"`
	Code      string    `gorm:"column:code;uniqueIndex;not null" json:"code"`
	Email     string    `gorm:"column:email;not null" json:"email"`
	ExpiresAt *DateTime `gorm:"column:expires_at" json:"expires_at"`
}

func (Invite) TableName() string {
	return "invites"
}

func (m *Invite) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = cuid2.Generate()
	}
	if m.Code == "" {
		m.Code = gonanoid.Must(8)
	}
	return nil
}

// A country keyed by its code, not by an `id`: an address refers to it through `countryCode`.
type Country struct {
	Code      string    `gorm:"column:code;primaryKey" json:"code"`
	Name      string    `gorm:"column:name;not null" json:"name"`
	Addresses []Address `gorm:"foreignKey:CountryCode;references:Code;constraint:OnDelete:RESTRICT"`
}

func (Country) TableName() string {
	return "countries"
}

type Address struct {
	ID          int      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	CountryCode string   `gorm:"column:country_code;not null" json:"country_code"`
	Line1       string   `gorm:"column:line1;not null" json:"line1"`
	Line2       *string  `gorm:"column:line2" json:"line2"`
	Country     *Country `gorm:"references:Code"`
}

func (Address) TableName() string {
	return "addresses"
}

// One column of every scalar type SQLite has, once required and once optional, and names that
// are Go keywords, Go initialisms or a method the generator writes itself. Nothing refers to it:
// it is here to be written and read back exactly.
type Sample struct {
	ID          int            `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Int         int            `gorm:"column:int;not null" json:"int"`
	IntOpt      *int           `gorm:"column:int_opt" json:"int_opt"`
	BigInt      int64          `gorm:"column:big_int;not null" json:"big_int"`
	BigIntOpt   *int64         `gorm:"column:big_int_opt" json:"big_int_opt"`
	Float       float64        `gorm:"column:float;not null" json:"float"`
	FloatOpt    *float64       `gorm:"column:float_opt" json:"float_opt"`
	Decimal     float64        `gorm:"column:decimal;not null" json:"decimal"`
	DecimalOpt  *float64       `gorm:"column:decimal_opt" json:"decimal_opt"`
	Boolean     bool           `gorm:"column:boolean;not null" json:"boolean"`
	BooleanOpt  *bool          `gorm:"column:boolean_opt" json:"boolean_opt"`
	String      string         `gorm:"column:string;not null" json:"string"`
	StringOpt   *string        `gorm:"column:string_opt" json:"string_opt"`
	DateTime    DateTime       `gorm:"column:date_time;not null" json:"date_time"`
	DateTimeOpt *DateTime      `gorm:"column:date_time_opt" json:"date_time_opt"`
	JSON        datatypes.JSON `gorm:"column:json;not null" json:"json"`
	JSONOpt     datatypes.JSON `gorm:"column:json_opt" json:"json_opt"`
	Bytes       []byte         `gorm:"column:bytes;not null" json:"bytes"`
	BytesOpt    []byte         `gorm:"column:bytes_opt" json:"bytes_opt"`
	Role        string         `gorm:"column:role;not null" json:"role"`
	RoleOpt     *string        `gorm:"column:role_opt" json:"role_opt"`
	// Go keywords as field names: `type`, `func`, `range`, `map`, `select`.
	Type   *string `gorm:"column:type;default:'plain';not null" json:"type"`
	Func   *string `gorm:"column:func" json:"func"`
	Range  *int    `gorm:"column:range" json:"range"`
	Map    *string `gorm:"column:map" json:"map"`
	Select bool    `gorm:"column:select;default:false;not null" json:"select"`
	// Initialisms, and a snake_case field beside a camelCase one.
	UserID   *int    `gorm:"column:user_id" json:"user_id"`
	URL      *string `gorm:"column:url" json:"url"`
	HTMLBody *string `gorm:"column:html_body" json:"html_body"`
	// A method GORM calls on the struct: the field cannot share its Go name.
	TableName_ *string `gorm:"column:table_name" json:"table_name"`
	// A literal default of every kind the struct tag has to quote: a quote and a backslash.
	Quoted *string  `gorm:"column:quoted;default:'it's \"quoted\" \\ here\\; really';not null" json:"quoted"`
	Ratio  *float64 `gorm:"column:ratio;default:0.5;not null" json:"ratio"`
	Price  *float64 `gorm:"column:price;default:9.99;not null" json:"price"`
	// Past 2^53, where a number that went through a float would come back one off.
	Big *int64 `gorm:"column:big;default:9007199254740993;not null" json:"big"`
}

func (Sample) TableName() string {
	return "samples"
}

type DateTime struct{ time.Time }

func (DateTime) GormDataType() string {
	return "time"
}

func (dateTime DateTime) Value() (driver.Value, error) {
	return dateTime.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000-07:00"), nil
}

func (dateTime *DateTime) Scan(src any) error {
	read, err := readPrismaTime(src)
	dateTime.Time = read
	return err
}

var prismaTimeLayouts = []string{
	"2006-01-02T15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07",
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02",
}

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
