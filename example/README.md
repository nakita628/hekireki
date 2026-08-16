# hekireki example

A single complex Prisma schema ([`schema.prisma`](./schema.prisma)) run through **every hekireki generator at once**, with the output committed under [`generated/`](./generated/) so the syntax of each target can be reviewed by eye.

## Run

```bash
pnpm example
```

This builds the generators, wipes `generated/`, runs `prisma generate`, and verifies that all 19 outputs exist — printing a ✓/✗ table and exiting non-zero if any generator produced nothing.

## What the schema exercises

- Enums: plain (`Role`) and fully `@map`-ped with `@@map` (`Visibility`)
- Every scalar type, scalar lists, native `@db.*` types, `@map`/`@@map` names
- Defaults: `uuid()`, `uuid(7)`, `cuid(2)`, `autoincrement()` (Int and BigInt), literals, `dbgenerated(...)`
- Relations: 1:1, 1:n, self-relation tree, composite PK, two named relations to the same model, implicit m2m (`_PostToTag`) and named implicit m2m (`_cast`)
- Referential actions (`Cascade`, `SetNull`), composite `@@unique`, `@@index`, `@updatedAt`
- Validator annotations (`@z.` / `@v.` / `@a.` / `@e.` / `@t.` / `@j.` / `@p.`) on `User` and `Post`; the remaining models fall back to the built-in type mapping
- Pydantic extra-key mode: `@p.strictObject` on `Profile` (`model_config = ConfigDict(extra="forbid")`)

## Outputs

| Generator                                        | Output                                                |
| ------------------------------------------------ | ----------------------------------------------------- |
| Zod / Valibot / ArkType / Effect / TypeBox / AJV | `generated/<name>/index.ts`                           |
| Drizzle                                          | `generated/drizzle/schema.ts`                         |
| Kysely                                           | `generated/kysely/types.ts`                           |
| SQLAlchemy                                       | `generated/sqlalchemy/models.py`                      |
| Pydantic                                         | `generated/pydantic/models.py`                        |
| GORM                                             | `generated/gorm/models.go`                            |
| Sea-ORM                                          | `generated/sea-orm/*.rs`                              |
| Ecto                                             | `generated/ecto/*.ex`                                 |
| Active Record                                    | `generated/activerecord/*.rb`                         |
| Eloquent                                         | `generated/eloquent/*.php`                            |
| Mermaid ER                                       | `generated/mermaid-er/ER.md`                          |
| DBML / PNG                                       | `generated/dbml/schema.dbml`, `generated/dbml/er.png` |
| Docs                                             | `generated/docs/index.html`                           |

Whether the output also compiles against each target's real toolchain is covered separately by `test/harness/` (`pnpm lang`); this example is for human inspection.
