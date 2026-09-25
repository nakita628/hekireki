package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/lucsky/cuid"
	gonanoid "github.com/matoous/go-nanoid/v2"
	"github.com/nrednav/cuid2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

// NamingStrategy keeps the names Prisma gave its many-to-many join tables
// (`_AToB`, columns `A` and `B`), which GORM would otherwise snake_case,
// pluralise and lowercase. Open the connection with it:
//
//	gorm.Open(dialector, &gorm.Config{NamingStrategy: models.NamingStrategy})
var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}

type User struct {
	ID          int        `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Email       string     `gorm:"column:email;uniqueIndex;not null" json:"email"`
	DisplayName *string    `gorm:"column:display_name" json:"display_name"`
	Role        string     `gorm:"column:role;default:'member';not null" json:"role"`
	Active      *bool      `gorm:"column:active;default:true;not null" json:"active"`
	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt   time.Time  `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	Posts       []Post     `gorm:"foreignKey:AuthorID;constraint:OnDelete:SET NULL"`
	Comments    []Comment  `gorm:"foreignKey:AuthorID;constraint:OnDelete:RESTRICT"`
	Following   []Follow   `gorm:"foreignKey:FollowerID;constraint:OnDelete:CASCADE"`
	Followers   []Follow   `gorm:"foreignKey:FolloweeID;constraint:OnDelete:CASCADE"`
	AuditLogs   []AuditLog `gorm:"foreignKey:UserEmail;references:Email;constraint:OnUpdate:CASCADE,OnDelete:NO ACTION"`
	Profile     *Profile   `gorm:"foreignKey:OwnerID;constraint:OnDelete:CASCADE"`
}

func (User) TableName() string {
	return "users"
}

type Profile struct {
	ID         int     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	OwnerID    int     `gorm:"column:owner_id;uniqueIndex;not null" json:"owner_id"`
	Bio        *string `gorm:"column:bio" json:"bio"`
	WebsiteURL *string `gorm:"column:website_url" json:"website_url"`
	Avatar     []byte  `gorm:"column:avatar" json:"avatar"`
	User       User    `gorm:"foreignKey:OwnerID"`
}

func (Profile) TableName() string {
	return "profiles"
}

type Category struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Name  string `gorm:"column:name;uniqueIndex;not null" json:"name"`
	Posts []Post `gorm:"foreignKey:CategoryID;constraint:OnDelete:SET DEFAULT"`
}

func (Category) TableName() string {
	return "categories"
}

type Post struct {
	ID         int       `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Title      string    `gorm:"column:title;not null" json:"title"`
	Slug       *string   `gorm:"column:slug;default:'untitled';not null" json:"slug"`
	Status     string    `gorm:"column:status;index:posts_author_id_status_idx;default:'DRAFT';not null" json:"status"`
	Views      int       `gorm:"column:views;default:0;not null" json:"views"`
	AuthorID   *int      `gorm:"column:author_id;index:posts_author_id_status_idx" json:"author_id"`
	CategoryID *int      `gorm:"column:category_id;default:1;not null" json:"category_id"`
	CreatedAt  time.Time `gorm:"column:created_at;autoCreateTime;not null" json:"created_at"`
	UpdatedAt  time.Time `gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`
	Author     User      `gorm:"foreignKey:AuthorID"`
	Category   Category
	Comments   []Comment `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE"`
	Tags       []Tag     `gorm:"many2many:_PostToTag;joinForeignKey:A;joinReferences:B"`
}

func (Post) TableName() string {
	return "posts"
}

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

type Comment struct {
	ID       string  `gorm:"column:id;primaryKey" json:"id"`
	Body     string  `gorm:"column:body;not null" json:"body"`
	Slot     int     `gorm:"column:slot;uniqueIndex:comments_post_id_slot_key;not null" json:"slot"`
	PostID   int     `gorm:"column:post_id;uniqueIndex:comments_post_id_slot_key;not null" json:"post_id"`
	AuthorID int     `gorm:"column:author_id;not null" json:"author_id"`
	ParentID *string `gorm:"column:parent_id" json:"parent_id"`
	Post     Post
	Author   User      `gorm:"foreignKey:AuthorID"`
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

type Follow struct {
	FollowerID int       `gorm:"column:follower_id;primaryKey" json:"follower_id"`
	FolloweeID int       `gorm:"column:followee_id;primaryKey" json:"followee_id"`
	Since      time.Time `gorm:"column:since;autoCreateTime;not null" json:"since"`
	Follower   User      `gorm:"foreignKey:FollowerID"`
	Followee   User      `gorm:"foreignKey:FolloweeID"`
}

func (Follow) TableName() string {
	return "follows"
}

type AuditLog struct {
	ID        int       `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserEmail string    `gorm:"column:user_email;not null" json:"user_email"`
	Action    string    `gorm:"column:action;not null" json:"action"`
	At        time.Time `gorm:"column:at;autoCreateTime;not null" json:"at"`
	User      User      `gorm:"references:Email"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

type Invite struct {
	ID        string     `gorm:"column:id;primaryKey" json:"id"`
	Code      string     `gorm:"column:code;uniqueIndex;not null" json:"code"`
	Email     string     `gorm:"column:email;not null" json:"email"`
	ExpiresAt *time.Time `gorm:"column:expires_at" json:"expires_at"`
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

type Country struct {
	Code      string    `gorm:"column:code;primaryKey" json:"code"`
	Name      string    `gorm:"column:name;not null" json:"name"`
	Addresses []Address `gorm:"foreignKey:CountryCode;references:Code;constraint:OnDelete:RESTRICT"`
}

func (Country) TableName() string {
	return "countries"
}

type Address struct {
	ID          int     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	CountryCode string  `gorm:"column:country_code;not null" json:"country_code"`
	Line1       string  `gorm:"column:line1;not null" json:"line1"`
	Line2       *string `gorm:"column:line2" json:"line2"`
	Country     Country `gorm:"references:Code"`
}

func (Address) TableName() string {
	return "addresses"
}

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
	DateTime    time.Time      `gorm:"column:date_time;not null" json:"date_time"`
	DateTimeOpt *time.Time     `gorm:"column:date_time_opt" json:"date_time_opt"`
	JSON        datatypes.JSON `gorm:"column:json;not null" json:"json"`
	JSONOpt     datatypes.JSON `gorm:"column:json_opt" json:"json_opt"`
	Bytes       []byte         `gorm:"column:bytes;not null" json:"bytes"`
	BytesOpt    []byte         `gorm:"column:bytes_opt" json:"bytes_opt"`
	Role        string         `gorm:"column:role;not null" json:"role"`
	RoleOpt     *string        `gorm:"column:role_opt" json:"role_opt"`
	Type        *string        `gorm:"column:type;default:'plain';not null" json:"type"`
	Func        *string        `gorm:"column:func" json:"func"`
	Range       *int           `gorm:"column:range" json:"range"`
	Map         *string        `gorm:"column:map" json:"map"`
	Select      bool           `gorm:"column:select;default:false;not null" json:"select"`
	UserID      *int           `gorm:"column:user_id" json:"user_id"`
	URL         *string        `gorm:"column:url" json:"url"`
	HTMLBody    *string        `gorm:"column:html_body" json:"html_body"`
	TableName_  *string        `gorm:"column:table_name" json:"table_name"`
	Quoted      *string        `gorm:"column:quoted;default:'it's \"quoted\" \\ here\\; really';not null" json:"quoted"`
	Ratio       *float64       `gorm:"column:ratio;default:0.5;not null" json:"ratio"`
	Price       *float64       `gorm:"column:price;default:9.99;not null" json:"price"`
	Big         *int64         `gorm:"column:big;default:9007199254740993;not null" json:"big"`
}

func (Sample) TableName() string {
	return "samples"
}
