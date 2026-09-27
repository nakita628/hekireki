import Config

# The database `prisma db push` creates beside schema.prisma. ecto_sqlite3 turns foreign keys on
# for every connection it opens (`foreign_keys: :on` is its default), so Prisma's ON DELETE rules
# hold; check.exs asks the connection to be sure.
config :shop, Shop.Repo,
  database: Path.expand("../dev.db", __DIR__),
  pool_size: 1

config :shop, ecto_repos: [Shop.Repo]

config :logger, level: :warning
