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

  # A changeset's errors by field, with %{count} and the like filled in as Phoenix fills them.
  def errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", fn _ -> to_string(value) end)
      end)
    end)
  end
end
