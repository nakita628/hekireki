defmodule Example.PrismaJson do
  use Ecto.Type

  defguardp is_json(value)
            when is_map(value) or is_list(value) or is_binary(value) or is_number(value) or
                   is_boolean(value)

  @impl true
  def type, do: :map

  @impl true
  def cast(value) when is_json(value), do: {:ok, value}
  def cast(_), do: :error

  @impl true
  def load(value) when is_json(value), do: {:ok, value}
  def load(_), do: :error

  @impl true
  def dump(value) when is_json(value), do: {:ok, value}
  def dump(_), do: :error
end