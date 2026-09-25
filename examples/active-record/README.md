# active-record

The models of `rails generate authentication` (`User` with `has_secure_password`, `Session` with
its `belongs_to`) and a blog around them, written by `hekireki-activerecord` from `schema.prisma`
and run against the real Active Record on SQLite. Everything the generator writes into a model is
used by `check.rb`, not only loaded, and the files are held to `rubocop-rails-omakase`.

```bash
pnpm install
cd examples/active-record
pnpm run demo
```

`app/models` and `config/locales/models` are committed as `prisma generate` writes them, so what
the schema becomes can be read here without running anything. `demo` starts from nothing all the
same: `prisma generate` writes `app/models` and `config/locales/models`,
`prisma db push` creates `dev.db`, `bundle install` puts Active Record 8.1, `sqlite3`, `bcrypt`
and RuboCop in `vendor/bundle`, `bundle exec ruby check.rb` runs the checks and prints one `ok:`
line for each, and `rubocop app/models` reads the generated files. Ruby 3.2 or newer is needed for
the Rails series in the `Gemfile`; the Lang Check workflow runs the same on its Active Record leg.

## What the check asks

It opens with the three bugs reported on schemas of this shape, so none comes back:

| Reported                                                                                                                                 | Asked of the generated model                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A NOT NULL `password_digest` got `presence: true`: a blank password was reported twice                                                   | `User.new(password: "")` has one error, on `password`, the one `has_secure_password` adds |
| `@ar.name` on the relation field `user` was dropped: the `belongs_to` error said "User"                                                  | `Session.new` fails with `ユーザーを入力してください`; `user_id` keeps its own name       |
| The model's `@ar.` lines came before the generated associations: `has_many :tags, through: :post_tags` raised `HasManyThroughOrderError` | `post.tags` and `tag.posts` answer                                                        |

Then each thing the schema promises, as Rails keeps it:

- **Validations.** A translated `@ar.` message answers with its `%{count}`; `@ar.format` on the
  address; `@ar.presence(false)` on a NOT NULL column a `before_validation` fills; a `@@unique`
  pair is one `taken` error on `slot`, scoped by `post_id`; `@unique` is `taken` on the second row,
  after `normalizes` has lowercased the address.
- **Attributes.** Literal defaults are on a new record before it is saved; an enum validates a
  value outside it instead of raising, stores the `@map` value, and takes `visibility_public?` where
  Ruby already has `public`; a column named `type` is a plain column; `createdAt` and `updatedAt`
  are filled, bumped by `update` and `touch`, and ordered by through their aliases; a `DateTime`
  is stored as the text Prisma writes on SQLite (`2030-01-02T03:04:05.678+00:00`, through the
  `PrismaDateTime` type in `application_record.rb`), not Active Record's
  `2030-01-02 03:04:05.678000`, and a `where` on the instant finds it; a `uuid()` key is made in
  Ruby and `first`/`last` follow `created_at`.
- **Associations.** `has_one` built from its owner and destroyed with it; `onDelete: SetNull`
  nullifies and the optional `belongs_to` may be empty; `Restrict` refuses to destroy an owner
  with children, as an error on the record; `Cascade` destroys the children; a self relation
  nullifies the replies of a destroyed parent; an implicit many-to-many goes through Prisma's
  `_CategoryToPost` both ways; a composite primary key finds and destroys one row.

`check.rb` sets two things a Rails application sets for itself and standalone Active Record does
not: `belongs_to_required_by_default`, which every `rails new` since 5.0 turns on, and the Japanese
`errors.format` and the `blank` and `required` messages that the `rails-i18n` gem supplies, here in
`config/locales/ja.yml` beside the generated `models/` directory.
