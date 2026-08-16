defmodule Example.AuditLog do
  use Ecto.Schema
  @moduledoc """
  DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: String.t(),
          action: String.t(),
          payload: map(),
          signature: binary() | nil,
          logged_at: DateTime.t()
        }

  schema "audit_logs" do
    field(:id, :string, primary_key: true)
    field(:action, :string)
    field(:payload, :map, default: %{})
    field(:signature, :binary)
    field(:logged_at, :utc_datetime)
  end
end