package model

import (
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Type-checks the generated structs against the real GORM API, and pins two
// semantic invariants that compile fine if wrong unless used: a scalar list
// must be a slice (not a scalar) and a self-relation must be a pointer (not a
// recursive value type).
var (
	_ datatypes.JSON
	_ []string  = Account{}.Tags
	_ *Category = Category{}.Parent
)

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(&Account{}, &Category{}, &Follow{}, &Post{}, &Tag{}, &Keyword{})
}
