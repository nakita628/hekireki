defmodule Shop.MixProject do
  use Mix.Project

  # The database is SQLite's dev.db unless ECTO_DATABASE names a PostgreSQL or MySQL one, as
  # provider.ts does. The schemas differ per provider (what a DateTime is written as), so each
  # provider has the ones generated for it under .provider/<provider>/lib and a build of its own.
  @provider (case System.get_env("ECTO_DATABASE") do
               "postgresql://" <> _ -> "postgresql"
               "mysql://" <> _ -> "mysql"
               _ -> "sqlite"
             end)

  # The generated schemas in lib/shop against the real Ecto. `mix run check.exs` uses them on the
  # database `prisma db push` made from schema.prisma.
  def project do
    [
      app: :shop,
      version: "0.0.0",
      elixir: "~> 1.14",
      elixirc_options: [warnings_as_errors: true],
      elixirc_paths:
        if(@provider == "sqlite", do: ["lib"], else: ["lib/shop.ex", "lib/check.ex", ".provider/#{@provider}/lib"]),
      build_path: if(@provider == "sqlite", do: "_build", else: ".provider/#{@provider}/_build"),
      deps: deps()
    ]
  end

  def application, do: [extra_applications: [:logger], mod: {Shop.Application, []}]

  # The newest releases that still run on Elixir 1.14: ecto_sqlite3 0.18 and exqlite 0.38 ask
  # for 1.15 and 1.16, ecto_sql 3.14 for 1.15, which holds ecto at 3.13, and postgrex 0.22 for
  # 1.15. ecto_sqlite3 0.17 and postgrex 0.21 ask for decimal 2, which EEF-CVE-2026-32686
  # affects; decimal 3 fixes it, and Ecto 3.13 and myxql 0.9 take it, so it overrides that
  # requirement.
  defp deps do
    [
      {:decimal, "== 3.1.1", override: true},
      {:ecto, "== 3.13.6"},
      {:ecto_sql, "== 3.13.5"},
      {:ecto_sqlite3, "== 0.17.6"},
      {:exqlite, "== 0.37.0"},
      {:jason, "== 1.4.4"},
      {:myxql, "== 0.9.0"},
      {:postgrex, "== 0.21.1"}
    ]
  end
end
