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
  defp deps do
    [
      {:ecto, "== 3.12.5"},
      {:ecto_sql, "== 3.12.1"}
    ]
  end
end
