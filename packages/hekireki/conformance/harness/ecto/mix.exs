defmodule Conformance.MixProject do
  use Mix.Project

  # Host harness for the Ecto conformance check. `mix compile` expands the
  # generated `use Ecto.Schema` / schema/2 DSL in lib/*.ex against the real
  # Ecto API, catching reserved-word collisions, bad field types and malformed
  # associations that a string-equality test cannot see.
  def project do
    [
      app: :conformance,
      version: "0.0.0",
      # Floor matches Ecto 3.12's own requirement so the check also runs on
      # local toolchains older than CI's (CI pins 1.18 via setup-beam).
      elixir: "~> 1.14",
      deps: deps()
    ]
  end

  def application, do: []

  # Exact-version pins keep resolution deterministic; the committed mix.lock
  # records the hex tarball hashes. Bumps go through Renovate.
  # Ecto 3.14+ is required for UUIDv7 autogeneration
  # (@primary_key {:id, Ecto.UUID, autogenerate: [version: 7]}).
  defp deps do
    [
      {:ecto, "== 3.14.1"},
      {:ecto_sql, "== 3.14.0"},
      {:ecto_ulid_next, "== 1.0.2"}
    ]
  end
end
