defmodule Shop.PrismaJson do
  use Ecto.Type

  defguardp is_json(value)
            when is_map(value) or is_list(value) or is_binary(value) or is_number(value) or
                   is_boolean(value)

  @impl true
  def type, do: :any

  @impl true
  def cast(value) when is_json(value), do: {:ok, value}
  def cast(_), do: :error

  @impl true
  def load(value) when is_number(value), do: {:ok, value}

  def load(value) when is_binary(value) do
    case Application.get_env(:ecto_sqlite3, :json_library, Jason).decode(value) do
      {:ok, json} -> {:ok, json}
      _ -> :error
    end
  end

  def load(_), do: :error

  @impl true
  def dump(value) when is_json(value) do
    case Application.get_env(:ecto_sqlite3, :json_library, Jason).encode(value) do
      {:ok, text} -> {:ok, text}
      _ -> :error
    end
  end

  def dump(_), do: :error
end