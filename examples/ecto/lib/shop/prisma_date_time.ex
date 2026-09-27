defmodule Shop.PrismaDateTime do
  use Ecto.Type

  @impl true
  def type, do: :string

  @impl true
  def cast(value) do
    with {:ok, datetime} <- Ecto.Type.cast(:utc_datetime_usec, value), do: {:ok, utc(datetime)}
  end

  @impl true
  def load(%DateTime{} = value), do: {:ok, utc(value)}
  def load(%NaiveDateTime{} = value), do: {:ok, value |> DateTime.from_naive!("Etc/UTC") |> utc()}
  def load(value) when is_integer(value), do: {:ok, value |> DateTime.from_unix!(:millisecond) |> utc()}

  def load(value) when is_binary(value) do
    value = String.replace(value, ~r/\s+(?=[+-]\d\d:?\d\d\z)/, "")

    case DateTime.from_iso8601(value) do
      {:ok, datetime, _offset} -> load(datetime)
      {:error, :missing_offset} -> load(NaiveDateTime.from_iso8601!(value))
      {:error, _} -> load_other(value)
    end
  end

  def load(_), do: :error

  @impl true
  def dump(%DateTime{} = value) do
    {:ok, value |> utc() |> DateTime.to_iso8601() |> String.replace_suffix("Z", "+00:00")}
  end

  def dump(_), do: :error

  @impl true
  def equal?(%DateTime{} = left, %DateTime{} = right), do: DateTime.compare(left, right) == :eq
  def equal?(left, right), do: left == right

  @impl true
  def autogenerate do
    called = System.monotonic_time(:microsecond)

    case Process.get(__MODULE__) do
      {read, now} when called - read < 1_000 ->
        now

      _ ->
        now = utc(DateTime.utc_now())
        Process.put(__MODULE__, {called, now})
        now
    end
  end

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