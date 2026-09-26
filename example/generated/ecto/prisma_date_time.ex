defmodule Example.PrismaDateTime do
  @moduledoc """
  A `DateTime` as Prisma Client keeps it: the instant in UTC, in milliseconds. Writes, and the
  values a query binds, go through `dump/1`, so Prisma finds what Ecto wrote by the same
  instant and Ecto what Prisma wrote: microseconds are cut to milliseconds, as a
  JavaScript Date holds them. A column with no time zone holds UTC.

  A value read is the instant Prisma reads: text with no zone is UTC, an offset is honoured, a
  date alone is midnight UTC, digits are epoch milliseconds. A `NaiveDateTime` is UTC, as
  `:utc_datetime` takes one; a `DateTime` in another zone is moved to UTC. An optional
  `@updatedAt` left `nil` on insert is filled with now; to store null, as Prisma Client does
  for an explicit null, give it with `Ecto.Changeset.force_change(changeset, field, nil)`.

  A `@db.Timestamptz` or `@db.Timetz` column holds the instant whatever the session, as
  Postgrex sends it, but Prisma Client writes it as UTC text with no zone, which PostgreSQL
  reads in the session's time zone, and reads the offset back as `+00:00`: connect Prisma
  Client with `options: '-c TimeZone=UTC'` where the server's zone is not UTC. The repo's
  session changes no value Ecto writes or reads; only a value the database fills in a column
  with no zone (`dbgenerated("CURRENT_TIMESTAMP")`, a `DEFAULT CURRENT_TIMESTAMP` on a row
  from `insert_all`) is that session's wall time, UTC with `parameters: [timezone: "UTC"]`.
  """
  use Ecto.Type

  @impl true
  def type, do: :utc_datetime_usec

  @impl true
  def cast(value) do
    with {:ok, datetime} <- Ecto.Type.cast(:utc_datetime_usec, value), do: {:ok, utc(datetime)}
  end

  @impl true
  def load(%DateTime{} = value), do: {:ok, utc(value)}
  def load(%NaiveDateTime{} = value), do: {:ok, value |> DateTime.from_naive!("Etc/UTC") |> utc()}
  def load(value) when is_integer(value), do: {:ok, value |> DateTime.from_unix!(:millisecond) |> utc()}

  def load(value) when is_binary(value) do
    # SQLite keeps a literal default as Prisma Migrate writes it: `2024-01-15 10:30:00 +00:00`.
    value = String.replace(value, ~r/\s+(?=[+-]\d\d:?\d\d\z)/, "")

    case DateTime.from_iso8601(value) do
      {:ok, datetime, _offset} -> load(datetime)
      {:error, :missing_offset} -> load(NaiveDateTime.from_iso8601!(value))
      {:error, _} -> load_other(value)
    end
  end

  def load(_), do: :error

  @impl true
  def dump(%DateTime{} = value), do: {:ok, utc(value)}

  def dump(_), do: :error

  @impl true
  def equal?(%DateTime{} = left, %DateTime{} = right), do: DateTime.compare(left, right) == :eq
  def equal?(left, right), do: left == right

  @doc """
  Now, as Prisma Client fills `now()` and `@updatedAt`. Ecto calls it once to a `timestamps()`
  and to an `autogenerate: true` field, so the fields of one insert can be 1 ms apart.
  """
  @impl true
  def autogenerate, do: utc(DateTime.utc_now())

  # A date alone, or epoch milliseconds as digits.
  defp load_other(value) do
    cond do
      value =~ ~r/\A-?\d+\z/ -> load(String.to_integer(value))
      match?({:ok, _}, Date.from_iso8601(value)) -> load(NaiveDateTime.new!(Date.from_iso8601!(value), ~T[00:00:00]))
      true -> :error
    end
  end

  defp utc(value) do
    %DateTime{microsecond: {microsecond, _}} = datetime = DateTime.shift_zone!(value, "Etc/UTC")
    %{datetime | microsecond: {div(microsecond, 1000) * 1000, 3}}
  end
end