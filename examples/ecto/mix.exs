defmodule Shop.MixProject do
  use Mix.Project

  # The generated schemas in lib/shop against the real Ecto on SQLite. `mix run check.exs` uses
  # them on dev.db, the database `prisma db push` made from schema.prisma.
  def project do
    [
      app: :shop,
      version: "0.0.0",
      elixir: "~> 1.14",
      elixirc_options: [warnings_as_errors: true],
      deps: deps()
    ]
  end

  def application, do: [extra_applications: [:logger], mod: {Shop.Application, []}]

  # The newest releases that still run on Elixir 1.14: ecto_sqlite3 0.18 and exqlite 0.38 ask
  # for 1.15 and 1.16, and ecto_sql 3.14 for 1.15, which holds ecto at 3.13. ecto_sqlite3 0.17
  # asks for decimal 2, which EEF-CVE-2026-32686 affects; decimal 3 fixes it, and Ecto 3.13 takes
  # it, so it overrides that requirement.
  defp deps do
    [
      {:decimal, "== 3.1.1", override: true},
      {:ecto, "== 3.13.6"},
      {:ecto_sql, "== 3.13.5"},
      {:ecto_sqlite3, "== 0.17.6"},
      {:exqlite, "== 0.37.0"},
      {:jason, "== 1.4.4"}
    ]
  end
end
