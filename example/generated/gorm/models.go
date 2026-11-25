package model

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nrednav/cuid2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}

// Application user. Fully annotated for every validator generator,
// with a UUIDv7 primary key, enum default, scalar list, @map columns,
// @updatedAt, and relations of every cardinality.
type User struct {
	// Primary key (UUIDv7)
	ID string `gorm:"column:id;primaryKey" json:"id"`
	// Unique login email
	Email string `gorm:"column:email;uniqueIndex:users_email_key;not null" json:"email"`
	// Display name
	Name      string             `gorm:"column:name;not null" json:"name"`
	Role      string             `gorm:"column:role;default:'VIEWER';not null" json:"role"`
	Interests ScalarList[string] `gorm:"column:interests;type:text[]" json:"interests"`
	CreatedAt DateTime           `gorm:"column:created_at;type:timestamp(3);default:CURRENT_TIMESTAMP;autoCreateTime:false;not null" json:"created_at"`
	UpdatedAt DateTime           `gorm:"column:updated_at;type:timestamp(3);autoUpdateTime:false;not null" json:"updated_at"`
	Posts     []Post             `gorm:"foreignKey:AuthorID;constraint:posts_author_id_fkey,OnUpdate:CASCADE,OnDelete:CASCADE"`
	Comments  []Comment          `gorm:"foreignKey:AuthorID;constraint:comments_author_id_fkey,OnUpdate:CASCADE,OnDelete:SET NULL"`
	Orders    []Order            `gorm:"foreignKey:UserID;constraint:orders_user_id_fkey,OnUpdate:CASCADE,OnDelete:RESTRICT"`
	Followers []Follow           `gorm:"foreignKey:FollowingID;constraint:follows_following_id_fkey,OnUpdate:CASCADE,OnDelete:CASCADE"`
	Following []Follow           `gorm:"foreignKey:FollowerID;constraint:follows_follower_id_fkey,OnUpdate:CASCADE,OnDelete:CASCADE"`
	Profile   *Profile           `gorm:"foreignKey:UserID;constraint:Profile_user_id_fkey,OnUpdate:CASCADE,OnDelete:CASCADE"`
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

// One-to-one relation with native @db.* types, literal defaults,
// and optional scalars of every flavour. ConfigDict passthrough: the
// Pydantic model rejects unknown keys (extra='forbid').
type Profile struct {
	ID       string         `gorm:"column:id;primaryKey" json:"id"`
	UserID   string         `gorm:"column:user_id;uniqueIndex:Profile_user_id_key;not null" json:"user_id"`
	Bio      *string        `gorm:"column:bio;type:text" json:"bio"`
	Nickname *string        `gorm:"column:nickname;type:varchar(64);default:'anonymous';not null" json:"nickname"`
	Age      *int           `gorm:"column:age;type:smallint" json:"age"`
	Balance  float64        `gorm:"column:balance;type:decimal(10,2);default:0;not null" json:"balance"`
	Verified bool           `gorm:"column:verified;default:false;not null" json:"verified"`
	Meta     datatypes.JSON `gorm:"column:meta" json:"meta"`
	Avatar   []byte         `gorm:"column:avatar" json:"avatar"`
	LastSeen *DateTime      `gorm:"column:last_seen;type:timestamptz(6)" json:"last_seen"`
	User     *User          `gorm:"belongsTo"`
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

// @@map + @map column names, FK with a referential action,
// mapped-enum default, and an implicit many-to-many to Tag.
type Post struct {
	// Primary key
	ID string `gorm:"column:id;primaryKey" json:"id"`
	// Article title
	Title      string    `gorm:"column:title;not null" json:"title"`
	Content    *string   `gorm:"column:content" json:"content"`
	Visibility string    `gorm:"column:visibility;default:'link_only';not null" json:"visibility"`
	Published  bool      `gorm:"column:published;default:false;not null" json:"published"`
	ViewCount  int       `gorm:"column:view_count;size:32;default:0;not null" json:"view_count"`
	AuthorID   string    `gorm:"column:author_id;index:posts_author_id_idx;not null" json:"author_id"`
	CreatedAt  DateTime  `gorm:"column:created_at;type:timestamp(3);default:CURRENT_TIMESTAMP;autoCreateTime:false;not null" json:"created_at"`
	Author     *User     `gorm:"foreignKey:AuthorID;belongsTo"`
	Comments   []Comment `gorm:"foreignKey:PostID;constraint:comments_post_id_fkey,OnUpdate:CASCADE,OnDelete:CASCADE"`
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

// Implicit many-to-many partner of Post (join table `_PostToTag`).
type Tag struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`
	Label string `gorm:"column:label;uniqueIndex:Tag_label_key;not null" json:"label"`
	Posts []Post `gorm:"many2many:_PostToTag;joinForeignKey:B;joinReferences:A"`
}

func (Tag) TableName() string {
	return "Tag"
}

// Two foreign keys with different referential actions
// (Cascade vs SetNull) and a composite index.
type Comment struct {
	ID        int      `gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`
	Body      string   `gorm:"column:body;not null" json:"body"`
	PostID    string   `gorm:"column:post_id;index:comments_post_id_created_at_idx,priority:1;not null" json:"post_id"`
	AuthorID  *string  `gorm:"column:author_id" json:"author_id"`
	CreatedAt DateTime `gorm:"column:created_at;index:comments_post_id_created_at_idx,priority:2;type:timestamp(3);default:CURRENT_TIMESTAMP;autoCreateTime:false;not null" json:"created_at"`
	Post      *Post    `gorm:"belongsTo"`
	Author    *User    `gorm:"foreignKey:AuthorID;belongsTo"`
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

// Composite primary key + two named relations to the same model.
type Follow struct {
	FollowerID  string   `gorm:"column:follower_id;primaryKey" json:"follower_id"`
	FollowingID string   `gorm:"column:following_id;primaryKey" json:"following_id"`
	Since       DateTime `gorm:"column:since;type:timestamp(3);default:CURRENT_TIMESTAMP;not null" json:"since"`
	Follower    *User    `gorm:"foreignKey:FollowerID;belongsTo"`
	Following   *User    `gorm:"foreignKey:FollowingID;belongsTo"`
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

// Self-relation (adjacency-list tree) with a composite unique.
type Category struct {
	ID       int        `gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`
	Name     string     `gorm:"column:name;uniqueIndex:Category_parent_id_name_key,priority:2;not null" json:"name"`
	ParentID *int       `gorm:"column:parent_id;uniqueIndex:Category_parent_id_name_key,priority:1;size:32" json:"parent_id"`
	Parent   *Category  `gorm:"foreignKey:ParentID;belongsTo"`
	Children []Category `gorm:"foreignKey:ParentID;constraint:Category_parent_id_fkey,OnUpdate:CASCADE,OnDelete:SET NULL"`
}

func (Category) TableName() string {
	return "Category"
}

// BigInt autoincrement primary key (bigserial) and money as Decimal.
type Order struct {
	ID       int64       `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID   string      `gorm:"column:user_id;not null" json:"user_id"`
	Total    float64     `gorm:"column:total;type:decimal(12,2);not null" json:"total"`
	PlacedAt DateTime    `gorm:"column:placed_at;type:timestamp(3);default:CURRENT_TIMESTAMP;not null" json:"placed_at"`
	User     *User       `gorm:"belongsTo"`
	Items    []OrderItem `gorm:"foreignKey:OrderID;constraint:order_items_order_id_fkey,OnUpdate:CASCADE,OnDelete:CASCADE"`
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

// Child of Order with a composite unique constraint.
type OrderItem struct {
	ID      int64   `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	OrderID int64   `gorm:"column:order_id;uniqueIndex:order_items_order_id_sku_key,priority:1;not null" json:"order_id"`
	Sku     string  `gorm:"column:sku;uniqueIndex:order_items_order_id_sku_key,priority:2;type:varchar(32);not null" json:"sku"`
	Qty     *int    `gorm:"column:qty;size:32;default:1;not null" json:"qty"`
	Price   float64 `gorm:"column:price;type:decimal(12,2);not null" json:"price"`
	Order   *Order  `gorm:"belongsTo"`
}

func (OrderItem) TableName() string {
	return "order_items"
}

// DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
type AuditLog struct {
	ID        string         `gorm:"column:id;primaryKey;type:char(36);default:gen_random_uuid()" json:"id"`
	Action    string         `gorm:"column:action;not null" json:"action"`
	Payload   datatypes.JSON `gorm:"column:payload;default:'{}';not null" json:"payload"`
	Signature []byte         `gorm:"column:signature" json:"signature"`
	LoggedAt  DateTime       `gorm:"column:logged_at;type:timestamp(3);default:now();not null" json:"logged_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

// Named implicit many-to-many: the join table is `_cast`,
// not `_ActorToFilm`.
type Actor struct {
	ID    int    `gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`
	Name  string `gorm:"column:name;not null" json:"name"`
	Films []Film `gorm:"many2many:_cast;joinForeignKey:A;joinReferences:B"`
}

func (Actor) TableName() string {
	return "Actor"
}

type Film struct {
	ID     int     `gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`
	Title  string  `gorm:"column:title;not null" json:"title"`
	Actors []Actor `gorm:"many2many:_cast;joinForeignKey:B;joinReferences:A"`
}

func (Film) TableName() string {
	return "Film"
}

type DateTime struct{ time.Time }

func (DateTime) GormDataType() string {
	return "time"
}

func (dateTime DateTime) Value() (driver.Value, error) {
	return dateTime.UTC().Truncate(time.Millisecond), nil
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

type ScalarList[T string | int | int64 | float64 | bool] []T

func (list ScalarList[T]) Value() (driver.Value, error) {
	items := make([]string, len(list))
	for i, item := range list {
		switch value := any(item).(type) {
		case string:
			items[i] = `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(value) + `"`
		case int:
			items[i] = strconv.FormatInt(int64(value), 10)
		case int64:
			items[i] = strconv.FormatInt(value, 10)
		case float64:
			items[i] = strings.NewReplacer("+Inf", "Infinity", "-Inf", "-Infinity").Replace(strconv.FormatFloat(value, 'g', -1, 64))
		case bool:
			items[i] = strconv.FormatBool(value)
		}
	}
	return "{" + strings.Join(items, ",") + "}", nil
}

func (list *ScalarList[T]) Scan(src any) error {
	var text string
	switch value := src.(type) {
	case nil:
		*list = ScalarList[T]{}
		return nil
	case []byte:
		text = string(value)
	case string:
		text = value
	default:
		return fmt.Errorf("an array column held %T", src)
	}
	items, err := arrayItems(text)
	if err != nil {
		return err
	}
	read := make(ScalarList[T], len(items))
	for i, item := range items {
		var value any
		var parseErr error
		switch any(read[i]).(type) {
		case string:
			value = item
		case int:
			value, parseErr = strconv.Atoi(item)
		case int64:
			value, parseErr = strconv.ParseInt(item, 10, 64)
		case float64:
			value, parseErr = strconv.ParseFloat(item, 64)
		case bool:
			switch item {
			case "t", "true":
				value = true
			case "f", "false":
				value = false
			default:
				parseErr = fmt.Errorf("%q is not a boolean", item)
			}
		}
		if parseErr != nil {
			return fmt.Errorf("an array column held %q: %w", text, parseErr)
		}
		read[i] = value.(T)
	}
	*list = read
	return nil
}

// arrayItems splits the text form of a one-dimensional PostgreSQL array into its elements,
// unquoted. A NULL element (an unquoted NULL) is an error: a Prisma list holds none, and the
// string "NULL" is written quoted.
func arrayItems(text string) ([]string, error) {
	// An array whose lower bound is not 1 is printed with its bounds first: [0:1]={x,a}.
	if strings.HasPrefix(text, "[") {
		if eq := strings.Index(text, "="); eq >= 0 {
			text = text[eq+1:]
		}
	}
	if len(text) < 2 || text[0] != '{' || text[len(text)-1] != '}' {
		return nil, fmt.Errorf("an array column held %q", text)
	}
	body := text[1 : len(text)-1]
	items := []string{}
	if body == "" {
		return items, nil
	}
	var item strings.Builder
	quoted, escaped, wasQuoted := false, false, false
	end := func() error {
		if !wasQuoted && item.String() == "NULL" {
			return fmt.Errorf("an array column held a NULL element: %q", text)
		}
		items = append(items, item.String())
		item.Reset()
		wasQuoted = false
		return nil
	}
	// Every delimiter is ASCII, so the text is walked byte by byte and any other byte kept as it is.
	for i := 0; i < len(body); i++ {
		r := body[i]
		switch {
		case escaped:
			item.WriteByte(r)
			escaped = false
		case r == '\\':
			escaped = true
		case r == '"':
			quoted = !quoted
			wasQuoted = true
		case r == ',' && !quoted:
			if err := end(); err != nil {
				return nil, err
			}
		default:
			item.WriteByte(r)
		}
	}
	if err := end(); err != nil {
		return nil, err
	}
	return items, nil
}
