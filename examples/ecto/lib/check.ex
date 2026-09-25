defmodule Shop.Check do
  @moduledoc "What check.exs says for each check: `ok: <name>`, or a raise with what it saw."

  def check(name, fun) do
    case fun.() do
      nil -> IO.puts("ok: #{name}")
      problem -> raise "#{name}: #{problem}"
    end
  end

  # Nothing, or what was not as expected, joined: each check lists what it saw.
  def reasons(list) do
    case Enum.reject(list, &is_nil/1) do
      [] -> nil
      found -> Enum.join(found, ", ")
    end
  end

  def expect(value, value, _label), do: nil
  def expect(got, want, label), do: "#{label}: expected #{inspect(want)}, got #{inspect(got)}"

  def row(sql, params \\ []), do: Shop.Repo.query!(sql, params).rows
end
