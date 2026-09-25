// The generated structs against the real GORM, on the SQLite database `prisma db push` made from
// schema.prisma. GORM never creates a table here: every struct is read and written through the
// table and column names the generator gave it, on the tables Prisma made. Each check prints
// `ok: <name>`, or stops the program with what it saw instead.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/nakita628/hekireki/examples/gorm/models"
)

var db *gorm.DB

// Every generated struct, children before their owners so the tables empty in this order.
var all = []any{
	&models.Comment{}, &models.Follow{}, &models.AuditLog{}, &models.Profile{}, &models.Address{},
	&models.Country{}, &models.Post{}, &models.Tag{}, &models.Category{}, &models.Invite{},
	&models.Sample{}, &models.User{},
}

func check(name string, run func() error) {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "FAILED: %s: %v\n", name, err)
		os.Exit(1)
	}
	fmt.Println("ok:", name)
}

func ptr[T any](value T) *T {
	return &value
}

// A user with an address of their own, so each check starts from rows nothing else touches.
func user(email string) (models.User, error) {
	row := models.User{Email: email}
	return row, db.Create(&row).Error
}

func main() {
	var err error
	// Foreign keys are off in SQLite until a connection asks; the onDelete checks need them on.
	// TranslateError turns the driver's constraint codes into gorm.ErrDuplicatedKey and
	// gorm.ErrForeignKeyViolated. The naming strategy is the generated one, which keeps the
	// name of Prisma's join table _PostToTag and its columns A and B.
	db, err = gorm.Open(sqlite.Open("file:dev.db?_pragma=foreign_keys(1)"), &gorm.Config{
		Logger:         logger.Default.LogMode(logger.Silent),
		TranslateError: true,
		NamingStrategy: models.NamingStrategy,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	// From empty tables each time, so the check can be run again.
	db.Exec(`DELETE FROM "_PostToTag"`)
	for _, model := range all {
		if err := db.Where("1 = 1").Delete(model).Error; err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	// The category a post falls back to when its own is deleted: `@default(1)`.
	if err := db.Create(&models.Category{ID: 1, Name: "Uncategorised"}).Error; err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	tables()
	scalars()
	defaults()
	keys()
	constraints()
	relations()
	deletes()
}

// --- The tables -------------------------------------------------------------------------------

func tables() {
	check("every struct names a table Prisma made, and exactly its columns", func() error {
		for _, model := range all {
			stmt := &gorm.Statement{DB: db}
			if err := stmt.Parse(model); err != nil {
				return fmt.Errorf("%T: %w", model, err)
			}
			if !db.Migrator().HasTable(stmt.Schema.Table) {
				return fmt.Errorf("%T: no table %q", model, stmt.Schema.Table)
			}
			types, err := db.Migrator().ColumnTypes(model)
			if err != nil {
				return err
			}
			var columns []string
			for _, column := range types {
				columns = append(columns, column.Name())
			}
			var fields []string
			for _, field := range stmt.Schema.Fields {
				if field.DBName != "" {
					fields = append(fields, field.DBName)
				}
			}
			slices.Sort(columns)
			slices.Sort(fields)
			if !slices.Equal(columns, fields) {
				return fmt.Errorf("%s: table has %v, struct has %v", stmt.Schema.Table, columns, fields)
			}
		}
		return nil
	})
}

// --- Scalars ----------------------------------------------------------------------------------

func scalars() {
	check("every scalar type reads back as it was written", func() error {
		at := time.Date(2024, 2, 29, 23, 59, 59, 123_000_000, time.UTC)
		want := models.Sample{
			Int:         -2147483648,
			IntOpt:      ptr(2147483647),
			BigInt:      9007199254740993,
			BigIntOpt:   ptr(int64(-9223372036854775808)),
			Float:       3.141592653589793,
			FloatOpt:    ptr(-0.1),
			Decimal:     1234.5678,
			DecimalOpt:  ptr(0.25),
			Boolean:     true,
			BooleanOpt:  ptr(false),
			String:      `日本語 🔥 'single' "double" \ ; end`,
			StringOpt:   ptr(""),
			DateTime:    at,
			DateTimeOpt: ptr(at.Add(-24 * time.Hour)),
			JSON:        datatypes.JSON(`{"a":1,"b":[true,null,"x"]}`),
			JSONOpt:     datatypes.JSON(`[]`),
			Bytes:       []byte{0, 1, 2, 255},
			BytesOpt:    []byte("optional"),
			Role:        "admin",
			RoleOpt:     ptr("GUEST"),
			Type:        ptr("type"),
			Func:        ptr("func"),
			Range:       ptr(3),
			Map:         ptr("map"),
			Select:      true,
			UserID:      ptr(7),
			URL:         ptr("https://example.com/"),
			HTMLBody:    ptr("<p>hi</p>"),
			TableName_:  ptr("samples"),
			Quoted:      ptr("set"),
			Ratio:       ptr(1.5),
			Price:       ptr(19.99),
			Big:         ptr(int64(-9007199254740993)),
		}
		if err := db.Create(&want).Error; err != nil {
			return err
		}
		var got models.Sample
		if err := db.First(&got, want.ID).Error; err != nil {
			return err
		}
		if !got.DateTime.Equal(want.DateTime) || !got.DateTimeOpt.Equal(*want.DateTimeOpt) {
			return fmt.Errorf("times: got %v and %v", got.DateTime, got.DateTimeOpt)
		}
		if !jsonEqual(got.JSON, want.JSON) || !jsonEqual(got.JSONOpt, want.JSONOpt) {
			return fmt.Errorf("json: got %s and %s", got.JSON, got.JSONOpt)
		}
		// Compared above as instants and as JSON values: the rest must be equal as they are.
		got.DateTime, got.DateTimeOpt, got.JSON, got.JSONOpt = want.DateTime, want.DateTimeOpt, want.JSON, want.JSONOpt
		if !reflect.DeepEqual(got, want) {
			return fmt.Errorf("\n got %+v\nwant %+v", got, want)
		}
		return nil
	})

	check("an optional field left nil is NULL, and reads back nil", func() error {
		row := models.Sample{Int: 1, BigInt: 1, Float: 1, Decimal: 1, String: "s", DateTime: time.Now(), JSON: datatypes.JSON(`{}`), Bytes: []byte{1}, Role: "member"}
		if err := db.Create(&row).Error; err != nil {
			return err
		}
		var nulls int
		err := db.Raw(`SELECT (int_opt IS NULL) + (big_int_opt IS NULL) + (float_opt IS NULL) + (decimal_opt IS NULL)
			+ (boolean_opt IS NULL) + (string_opt IS NULL) + (date_time_opt IS NULL) + (json_opt IS NULL)
			+ (bytes_opt IS NULL) + (role_opt IS NULL) + (func IS NULL) + ("range" IS NULL) + ("map" IS NULL)
			+ (user_id IS NULL) + (url IS NULL) + (html_body IS NULL) + (table_name IS NULL)
			FROM samples WHERE id = ?`, row.ID).Scan(&nulls).Error
		if err != nil {
			return err
		}
		if nulls != 17 {
			return fmt.Errorf("expected 17 NULL columns, got %d", nulls)
		}
		var got models.Sample
		if err := db.First(&got, row.ID).Error; err != nil {
			return err
		}
		if got.IntOpt != nil || got.BigIntOpt != nil || got.FloatOpt != nil || got.DecimalOpt != nil ||
			got.BooleanOpt != nil || got.StringOpt != nil || got.DateTimeOpt != nil || got.JSONOpt != nil ||
			got.BytesOpt != nil || got.RoleOpt != nil || got.UserID != nil || got.URL != nil || got.TableName_ != nil {
			return fmt.Errorf("a nil field came back set: %+v", got)
		}
		return nil
	})
}

func jsonEqual(a, b datatypes.JSON) bool {
	var x, y any
	return json.Unmarshal(a, &x) == nil && json.Unmarshal(b, &y) == nil && reflect.DeepEqual(x, y)
}

// --- Defaults ---------------------------------------------------------------------------------

func defaults() {
	check("a field left out takes the schema's default, @map'ed enum value included", func() error {
		u, err := user("defaults@example.com")
		if err != nil {
			return err
		}
		var role string
		var active bool
		if err := db.Raw("SELECT role, active FROM users WHERE id = ?", u.ID).Row().Scan(&role, &active); err != nil {
			return err
		}
		if role != "member" || !active || u.Role != "member" || u.Active == nil || !*u.Active {
			return fmt.Errorf("stored role %q active %v, struct role %q active %v", role, active, u.Role, u.Active)
		}
		post := models.Post{Title: "Defaults"}
		if err := db.Create(&post).Error; err != nil {
			return err
		}
		var got models.Post
		if err := db.First(&got, post.ID).Error; err != nil {
			return err
		}
		if *got.Slug != "untitled" || got.Status != "DRAFT" || got.Views != 0 || *got.CategoryID != 1 || got.AuthorID != nil {
			return fmt.Errorf("post read back as slug %q status %q views %d category %d author %v", *got.Slug, got.Status, got.Views, *got.CategoryID, got.AuthorID)
		}
		sample := models.Sample{Int: 1, BigInt: 1, Float: 1, Decimal: 1, String: "s", DateTime: time.Now(), JSON: datatypes.JSON(`{}`), Bytes: []byte{1}, Role: "GUEST"}
		if err := db.Create(&sample).Error; err != nil {
			return err
		}
		var s models.Sample
		if err := db.First(&s, sample.ID).Error; err != nil {
			return err
		}
		if *s.Type != "plain" || *s.Quoted != `it's "quoted" \ here; really` || *s.Ratio != 0.5 || *s.Price != 9.99 || *s.Big != 9007199254740993 || s.Select {
			return fmt.Errorf("sample read back as type %q quoted %q ratio %v price %v big %d select %v", *s.Type, *s.Quoted, *s.Ratio, *s.Price, *s.Big, s.Select)
		}
		return nil
	})

	check("a zero value set on purpose is stored, not replaced by a non-zero default", func() error {
		u := models.User{Email: "inactive@example.com", Active: ptr(false)}
		if err := db.Create(&u).Error; err != nil {
			return err
		}
		post := models.Post{Title: "Zero", Slug: ptr("")}
		if err := db.Create(&post).Error; err != nil {
			return err
		}
		sample := models.Sample{Int: 1, BigInt: 1, Float: 1, Decimal: 1, String: "s", DateTime: time.Now(), JSON: datatypes.JSON(`{}`), Bytes: []byte{1}, Role: "GUEST",
			Type: ptr(""), Quoted: ptr(""), Ratio: ptr(0.0), Price: ptr(0.0), Big: ptr(int64(0))}
		if err := db.Create(&sample).Error; err != nil {
			return err
		}
		var active bool
		var slug string
		db.Raw("SELECT active FROM users WHERE id = ?", u.ID).Scan(&active)
		db.Raw("SELECT slug FROM posts WHERE id = ?", post.ID).Scan(&slug)
		var s models.Sample
		if err := db.First(&s, sample.ID).Error; err != nil {
			return err
		}
		if active || slug != "" || *s.Type != "" || *s.Quoted != "" || *s.Ratio != 0 || *s.Price != 0 || *s.Big != 0 {
			return fmt.Errorf("active %v slug %q type %q quoted %q ratio %v price %v big %d", active, slug, *s.Type, *s.Quoted, *s.Ratio, *s.Price, *s.Big)
		}
		return nil
	})

	check("@default(now()) is filled on create and @updatedAt is bumped by an update", func() error {
		before := time.Now().Add(-time.Second)
		post := models.Post{Title: "Timestamps"}
		if err := db.Create(&post).Error; err != nil {
			return err
		}
		if post.CreatedAt.Before(before) || post.UpdatedAt.Before(before) {
			return fmt.Errorf("created %v updated %v", post.CreatedAt, post.UpdatedAt)
		}
		created, updated := post.CreatedAt, post.UpdatedAt
		time.Sleep(20 * time.Millisecond)
		if err := db.Model(&post).Update("title", "Timestamps, edited").Error; err != nil {
			return err
		}
		var got models.Post
		if err := db.First(&got, post.ID).Error; err != nil {
			return err
		}
		if !got.UpdatedAt.After(updated) || !got.CreatedAt.Equal(created) {
			return fmt.Errorf("after the update: created %v (was %v), updated %v (was %v)", got.CreatedAt, created, got.UpdatedAt, updated)
		}
		var at, since time.Time
		u, err := user("stamps@example.com")
		if err != nil {
			return err
		}
		logLine := models.AuditLog{UserEmail: u.Email, Action: "signed up"}
		follow := models.Follow{FollowerID: u.ID, FolloweeID: u.ID}
		if err := db.Create(&logLine).Error; err != nil {
			return err
		}
		if err := db.Create(&follow).Error; err != nil {
			return err
		}
		db.Raw("SELECT at FROM audit_logs WHERE id = ?", logLine.ID).Scan(&at)
		db.Raw("SELECT since FROM follows WHERE follower_id = ?", u.ID).Scan(&since)
		if at.Before(before) || since.Before(before) {
			return fmt.Errorf("at %v since %v", at, since)
		}
		return nil
	})
}

// --- Keys -------------------------------------------------------------------------------------

func keys() {
	check("autoincrement keys come back into the struct", func() error {
		a, err := user("first@example.com")
		if err != nil {
			return err
		}
		b, err := user("second@example.com")
		if err != nil {
			return err
		}
		logLine := models.AuditLog{UserEmail: a.Email, Action: "created"}
		if err := db.Create(&logLine).Error; err != nil {
			return err
		}
		if a.ID == 0 || b.ID <= a.ID || logLine.ID == 0 {
			return fmt.Errorf("ids %d, %d and %d", a.ID, b.ID, logLine.ID)
		}
		return nil
	})

	check("uuid(), cuid(), cuid(2) and nanoid(8) are made in Go before the insert", func() error {
		tags := []models.Tag{{Name: "go"}, {Name: "sql"}}
		if err := db.Create(&tags).Error; err != nil {
			return err
		}
		u, err := user("keys@example.com")
		if err != nil {
			return err
		}
		post := models.Post{Title: "Keys"}
		if err := db.Create(&post).Error; err != nil {
			return err
		}
		comments := []models.Comment{{Body: "a", Slot: 1, PostID: post.ID, AuthorID: u.ID}, {Body: "b", Slot: 2, PostID: post.ID, AuthorID: u.ID}}
		if err := db.Create(&comments).Error; err != nil {
			return err
		}
		invites := []models.Invite{{Email: "a@example.com"}, {Email: "b@example.com"}}
		if err := db.Create(&invites).Error; err != nil {
			return err
		}
		patterns := []struct {
			name    string
			pattern string
			values  []string
		}{
			{"uuid", `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, []string{tags[0].ID, tags[1].ID}},
			{"cuid", `^c[0-9a-z]{24}$`, []string{comments[0].ID, comments[1].ID}},
			{"cuid2", `^[a-z][0-9a-z]{23}$`, []string{invites[0].ID, invites[1].ID}},
			{"nanoid", `^[A-Za-z0-9_-]{8}$`, []string{invites[0].Code, invites[1].Code}},
		}
		for _, p := range patterns {
			for _, value := range p.values {
				if !regexp.MustCompile(p.pattern).MatchString(value) {
					return fmt.Errorf("%s %q", p.name, value)
				}
			}
			if p.values[0] == p.values[1] {
				return fmt.Errorf("two rows share the %s %q", p.name, p.values[0])
			}
		}
		// A key given by hand is kept.
		mine := models.Tag{ID: "00000000-0000-4000-8000-000000000000", Name: "mine"}
		if err := db.Create(&mine).Error; err != nil {
			return err
		}
		return db.First(&models.Tag{}, "id = ?", mine.ID).Error
	})

	check("a composite primary key finds, refuses a duplicate and deletes one row", func() error {
		a, _ := user("follower@example.com")
		b, _ := user("followee@example.com")
		c, _ := user("other@example.com")
		for _, f := range []models.Follow{{FollowerID: a.ID, FolloweeID: b.ID}, {FollowerID: a.ID, FolloweeID: c.ID}} {
			if err := db.Create(&f).Error; err != nil {
				return err
			}
		}
		if err := db.Create(&models.Follow{FollowerID: a.ID, FolloweeID: b.ID}).Error; !errors.Is(err, gorm.ErrDuplicatedKey) {
			return fmt.Errorf("a second (a, b) was not a duplicate: %v", err)
		}
		var found models.Follow
		if err := db.First(&found, "follower_id = ? AND followee_id = ?", a.ID, c.ID).Error; err != nil {
			return err
		}
		if err := db.Delete(&found).Error; err != nil {
			return err
		}
		var left []models.Follow
		db.Where("follower_id = ?", a.ID).Find(&left)
		if len(left) != 1 || left[0].FolloweeID != b.ID {
			return fmt.Errorf("left %+v", left)
		}
		return nil
	})
}

// --- Constraints ------------------------------------------------------------------------------

func constraints() {
	check("@unique refuses a second row as gorm.ErrDuplicatedKey", func() error {
		if _, err := user("unique@example.com"); err != nil {
			return err
		}
		if _, err := user("unique@example.com"); !errors.Is(err, gorm.ErrDuplicatedKey) {
			return fmt.Errorf("got %v", err)
		}
		if err := db.Create(&models.Tag{Name: "go"}).Error; !errors.Is(err, gorm.ErrDuplicatedKey) {
			return fmt.Errorf("tag: got %v", err)
		}
		return nil
	})

	check("@@unique([postId, slot]) refuses a pair, not either half", func() error {
		u, _ := user("slots@example.com")
		first, second := models.Post{Title: "One"}, models.Post{Title: "Two"}
		db.Create(&first)
		db.Create(&second)
		if err := db.Create(&models.Comment{Body: "x", Slot: 1, PostID: first.ID, AuthorID: u.ID}).Error; err != nil {
			return err
		}
		if err := db.Create(&models.Comment{Body: "y", Slot: 1, PostID: first.ID, AuthorID: u.ID}).Error; !errors.Is(err, gorm.ErrDuplicatedKey) {
			return fmt.Errorf("same post and slot: got %v", err)
		}
		if err := db.Create(&models.Comment{Body: "z", Slot: 1, PostID: second.ID, AuthorID: u.ID}).Error; err != nil {
			return fmt.Errorf("same slot on another post: %w", err)
		}
		return db.Create(&models.Comment{Body: "w", Slot: 2, PostID: first.ID, AuthorID: u.ID}).Error
	})

	check("a foreign key to nothing is gorm.ErrForeignKeyViolated", func() error {
		err := db.Create(&models.Comment{Body: "orphan", Slot: 1, PostID: -1, AuthorID: -1}).Error
		if !errors.Is(err, gorm.ErrForeignKeyViolated) {
			return fmt.Errorf("got %v", err)
		}
		return nil
	})
}

// --- Relations --------------------------------------------------------------------------------

func relations() {
	check("1-1: a profile and its user load each other through owner_id", func() error {
		u, _ := user("profile@example.com")
		profile := models.Profile{OwnerID: u.ID, Bio: ptr("Hi"), WebsiteURL: ptr("https://example.com"), Avatar: []byte{0x89, 'P', 'N', 'G'}}
		if err := db.Create(&profile).Error; err != nil {
			return err
		}
		var owner models.User
		if err := db.Preload("Profile").First(&owner, u.ID).Error; err != nil {
			return err
		}
		if owner.Profile == nil || owner.Profile.ID != profile.ID || !bytes.Equal(owner.Profile.Avatar, profile.Avatar) {
			return fmt.Errorf("user.Profile %+v", owner.Profile)
		}
		var got models.Profile
		if err := db.Preload("User").First(&got, profile.ID).Error; err != nil {
			return err
		}
		if got.User.Email != u.Email {
			return fmt.Errorf("profile.User %+v", got.User)
		}
		if err := db.Create(&models.Profile{OwnerID: u.ID}).Error; !errors.Is(err, gorm.ErrDuplicatedKey) {
			return fmt.Errorf("a second profile: got %v", err)
		}
		return nil
	})

	check("1-n: posts, their author and category, both ways", func() error {
		u, _ := user("author@example.com")
		news := models.Category{Name: "News"}
		db.Create(&news)
		for _, title := range []string{"First", "Second"} {
			if err := db.Create(&models.Post{Title: title, AuthorID: &u.ID, CategoryID: &news.ID}).Error; err != nil {
				return err
			}
		}
		var author models.User
		if err := db.Preload("Posts", func(tx *gorm.DB) *gorm.DB { return tx.Order("id") }).First(&author, u.ID).Error; err != nil {
			return err
		}
		if len(author.Posts) != 2 || author.Posts[0].Title != "First" || author.Posts[1].Title != "Second" {
			return fmt.Errorf("user.Posts %+v", author.Posts)
		}
		var post models.Post
		if err := db.Preload("Author").Preload("Category").First(&post, author.Posts[0].ID).Error; err != nil {
			return err
		}
		if post.Author.ID != u.ID || post.Category.Name != "News" {
			return fmt.Errorf("post.Author %d post.Category %q", post.Author.ID, post.Category.Name)
		}
		var category models.Category
		if err := db.Preload("Posts").First(&category, news.ID).Error; err != nil {
			return err
		}
		if len(category.Posts) != 2 {
			return fmt.Errorf("category.Posts %d", len(category.Posts))
		}
		return nil
	})

	check("1-n on a key that is not the primary key: an audit log names its user by email", func() error {
		u, _ := user("audited@example.com")
		db.Create(&models.AuditLog{UserEmail: u.Email, Action: "login"})
		var got models.User
		if err := db.Preload("AuditLogs").First(&got, u.ID).Error; err != nil {
			return err
		}
		if len(got.AuditLogs) != 1 || got.AuditLogs[0].Action != "login" {
			return fmt.Errorf("user.AuditLogs %+v", got.AuditLogs)
		}
		var line models.AuditLog
		if err := db.Preload("User").First(&line, got.AuditLogs[0].ID).Error; err != nil {
			return err
		}
		if line.User.ID != u.ID {
			return fmt.Errorf("auditLog.User %+v", line.User)
		}
		return nil
	})

	check("1-n on a primary key that is not id: an address and its country by code", func() error {
		gb := models.Country{Code: "GB", Name: "United Kingdom"}
		if err := db.Create(&gb).Error; err != nil {
			return err
		}
		if err := db.Create(&models.Address{CountryCode: "GB", Line1: "10 Downing Street"}).Error; err != nil {
			return err
		}
		var country models.Country
		if err := db.Preload("Addresses").First(&country, "code = ?", "GB").Error; err != nil {
			return err
		}
		if len(country.Addresses) != 1 || country.Addresses[0].Line2 != nil {
			return fmt.Errorf("country.Addresses %+v", country.Addresses)
		}
		var address models.Address
		if err := db.Preload("Country").First(&address, country.Addresses[0].ID).Error; err != nil {
			return err
		}
		if address.Country.Name != "United Kingdom" {
			return fmt.Errorf("address.Country %+v", address.Country)
		}
		return nil
	})

	check("a self relation: a comment's replies and a reply's parent", func() error {
		u, _ := user("thread@example.com")
		post := models.Post{Title: "Thread"}
		db.Create(&post)
		parent := models.Comment{Body: "parent", Slot: 1, PostID: post.ID, AuthorID: u.ID}
		db.Create(&parent)
		reply := models.Comment{Body: "reply", Slot: 2, PostID: post.ID, AuthorID: u.ID, ParentID: &parent.ID}
		if err := db.Create(&reply).Error; err != nil {
			return err
		}
		var got models.Comment
		if err := db.Preload("Replies").Preload("Parent").First(&got, "id = ?", parent.ID).Error; err != nil {
			return err
		}
		if len(got.Replies) != 1 || got.Replies[0].ID != reply.ID || got.Parent != nil {
			return fmt.Errorf("parent.Replies %+v, parent.Parent %+v", got.Replies, got.Parent)
		}
		var child models.Comment
		if err := db.Preload("Parent").First(&child, "id = ?", reply.ID).Error; err != nil {
			return err
		}
		if child.Parent == nil || child.Parent.ID != parent.ID {
			return fmt.Errorf("reply.Parent %+v", child.Parent)
		}
		return nil
	})

	check("an explicit m-n through Follow: who a user follows and who follows them", func() error {
		ann, _ := user("ann@example.com")
		bob, _ := user("bob@example.com")
		cat, _ := user("cat@example.com")
		db.Create(&[]models.Follow{{FollowerID: ann.ID, FolloweeID: bob.ID}, {FollowerID: cat.ID, FolloweeID: bob.ID}, {FollowerID: bob.ID, FolloweeID: ann.ID}})
		var got models.User
		if err := db.Preload("Following.Followee").Preload("Followers.Follower", func(tx *gorm.DB) *gorm.DB { return tx.Order("id") }).First(&got, bob.ID).Error; err != nil {
			return err
		}
		var followers []string
		for _, f := range got.Followers {
			followers = append(followers, f.Follower.Email)
		}
		slices.Sort(followers)
		if len(got.Following) != 1 || got.Following[0].Followee.Email != ann.Email || !slices.Equal(followers, []string{ann.Email, cat.Email}) {
			return fmt.Errorf("following %+v, followers %v", got.Following, followers)
		}
		return nil
	})

	check("an implicit m-n goes through Prisma's _PostToTag, columns A and B, both ways", func() error {
		red, blue := models.Tag{Name: "red"}, models.Tag{Name: "blue"}
		post := models.Post{Title: "Tagged", Tags: []models.Tag{red, blue}}
		if err := db.Create(&post).Error; err != nil {
			return err
		}
		var rows []struct {
			A int
			B string
		}
		db.Raw(`SELECT "A", "B" FROM "_PostToTag" WHERE "A" = ?`, post.ID).Scan(&rows)
		if len(rows) != 2 || rows[0].B == "" {
			return fmt.Errorf("join rows %+v", rows)
		}
		var got models.Post
		if err := db.Preload("Tags", func(tx *gorm.DB) *gorm.DB { return tx.Order("name") }).First(&got, post.ID).Error; err != nil {
			return err
		}
		if len(got.Tags) != 2 || got.Tags[0].Name != "blue" || got.Tags[1].Name != "red" {
			return fmt.Errorf("post.Tags %+v", got.Tags)
		}
		var tag models.Tag
		if err := db.Preload("Posts").First(&tag, "name = ?", "red").Error; err != nil {
			return err
		}
		if len(tag.Posts) != 1 || tag.Posts[0].ID != post.ID {
			return fmt.Errorf("tag.Posts %+v", tag.Posts)
		}
		if err := db.Model(&got).Association("Tags").Delete(&got.Tags[0]); err != nil {
			return err
		}
		if n := db.Model(&got).Association("Tags").Count(); n != 1 {
			return fmt.Errorf("after removing one tag, %d left", n)
		}
		return nil
	})
}

// --- onDelete and onUpdate ------------------------------------------------------------------

func count(model any, query string, args ...any) int64 {
	var n int64
	db.Model(model).Where(query, args...).Count(&n)
	return n
}

func deletes() {
	check("onDelete: Cascade takes the profile and the follows with their user, the comments and join rows with their post", func() error {
		u, _ := user("cascade@example.com")
		other, _ := user("cascade-other@example.com")
		db.Create(&models.Profile{OwnerID: u.ID})
		db.Create(&models.Follow{FollowerID: other.ID, FolloweeID: u.ID})
		if err := db.Delete(&u).Error; err != nil {
			return err
		}
		if n := count(&models.Profile{}, "owner_id = ?", u.ID) + count(&models.Follow{}, "followee_id = ?", u.ID); n != 0 {
			return fmt.Errorf("%d rows outlived their user", n)
		}
		post := models.Post{Title: "Doomed", Tags: []models.Tag{{Name: "doomed"}}}
		db.Create(&post)
		db.Create(&models.Comment{Body: "gone", Slot: 1, PostID: post.ID, AuthorID: other.ID})
		if err := db.Delete(&post).Error; err != nil {
			return err
		}
		var joins int64
		db.Raw(`SELECT count(*) FROM "_PostToTag" WHERE "A" = ?`, post.ID).Scan(&joins)
		if n := count(&models.Comment{}, "post_id = ?", post.ID); n != 0 || joins != 0 {
			return fmt.Errorf("%d comments and %d join rows outlived their post", n, joins)
		}
		return nil
	})

	check("onDelete: SetNull empties a post's author and a reply's parent", func() error {
		u, _ := user("setnull@example.com")
		writer, _ := user("setnull-writer@example.com")
		post := models.Post{Title: "Kept", AuthorID: &u.ID}
		db.Create(&post)
		if err := db.Delete(&u).Error; err != nil {
			return err
		}
		var got models.Post
		if err := db.First(&got, post.ID).Error; err != nil {
			return err
		}
		if got.AuthorID != nil {
			return fmt.Errorf("author_id %d", *got.AuthorID)
		}
		parent := models.Comment{Body: "parent", Slot: 1, PostID: post.ID, AuthorID: writer.ID}
		db.Create(&parent)
		reply := models.Comment{Body: "reply", Slot: 2, PostID: post.ID, AuthorID: writer.ID, ParentID: &parent.ID}
		db.Create(&reply)
		if err := db.Delete(&parent).Error; err != nil {
			return err
		}
		var child models.Comment
		db.First(&child, "id = ?", reply.ID)
		if child.ParentID != nil {
			return fmt.Errorf("parent_id %q", *child.ParentID)
		}
		return nil
	})

	check("onDelete: SetDefault hands the posts of a deleted category to category 1", func() error {
		gone := models.Category{Name: "Gone"}
		db.Create(&gone)
		post := models.Post{Title: "Moved", CategoryID: &gone.ID}
		db.Create(&post)
		if err := db.Delete(&gone).Error; err != nil {
			return err
		}
		var got models.Post
		db.First(&got, post.ID)
		if *got.CategoryID != 1 {
			return fmt.Errorf("category_id %d", *got.CategoryID)
		}
		return nil
	})

	// SQLite checks RESTRICT at once and NO ACTION at the end of the statement; the driver
	// translates only the second one's code (787) into gorm.ErrForeignKeyViolated, and reports the
	// first as a trigger constraint (1811) with the same message.
	refused := func(err error) bool {
		return errors.Is(err, gorm.ErrForeignKeyViolated) || err != nil && strings.Contains(err.Error(), "FOREIGN KEY constraint failed")
	}
	check("onDelete: Restrict and NoAction refuse to delete an owner with children", func() error {
		u, _ := user("restrict@example.com")
		post := models.Post{Title: "Commented"}
		db.Create(&post)
		db.Create(&models.Comment{Body: "keep me", Slot: 1, PostID: post.ID, AuthorID: u.ID})
		if err := db.Delete(&u).Error; !refused(err) {
			return fmt.Errorf("a commenter: got %v", err)
		}
		logged, _ := user("noaction@example.com")
		db.Create(&models.AuditLog{UserEmail: logged.Email, Action: "stay"})
		if err := db.Delete(&logged).Error; !errors.Is(err, gorm.ErrForeignKeyViolated) {
			return fmt.Errorf("a logged user: got %v", err)
		}
		if err := db.Delete(&models.Country{Code: "GB"}).Error; !refused(err) {
			return fmt.Errorf("a country with addresses: got %v", err)
		}
		if n := count(&models.User{}, "id IN ?", []int{u.ID, logged.ID}); n != 2 {
			return fmt.Errorf("%d of 2 users left", n)
		}
		return nil
	})

	check("onUpdate: Cascade carries a changed email into the audit log", func() error {
		u, _ := user("before@example.com")
		db.Create(&models.AuditLog{UserEmail: u.Email, Action: "renamed"})
		if err := db.Model(&u).Update("email", "after@example.com").Error; err != nil {
			return err
		}
		if n := count(&models.AuditLog{}, "user_email = ?", "after@example.com"); n != 1 {
			return fmt.Errorf("%d log lines follow the new address", n)
		}
		return nil
	})
}
