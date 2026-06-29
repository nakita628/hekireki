// The generated Sea-ORM entities live in src/entities/ (mod.rs + one file per
// model/enum). `cargo check` expands every DeriveEntityModel / DeriveActiveEnum
// / DeriveRelation macro against the real sea-orm API, so a generated file that
// is syntactically valid but semantically wrong (bad column type, malformed
// relation) fails the build.
mod entities;

// Pins the scalar-list invariant in the type system: `tags` must stay a Vec,
// not collapse to a scalar (which would compile but silently drop the array).
#[allow(dead_code)]
fn _smoke_tags_is_list(m: entities::account::Model) -> Vec<String> {
    m.tags
}
