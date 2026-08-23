defmodule Example.Follow do
  use Ecto.Schema
  @moduledoc """
  Composite primary key + two named relations to the same model.
  """

  @primary_key false

  @type t :: %__MODULE__{
          follower_id: Ecto.UUID.t(),
          following_id: Ecto.UUID.t(),
          since: DateTime.t(),
          follower: Example.User.t() | nil,
          following: Example.User.t() | nil
        }

  schema "follows" do
    field(:since, :utc_datetime)
    field(:follower_id, :binary_id, primary_key: true)
    field(:following_id, :binary_id, primary_key: true)
    belongs_to(:follower, Example.User, foreign_key: :follower_id, define_field: false, type: :binary_id)
    belongs_to(:following, Example.User, foreign_key: :following_id, define_field: false, type: :binary_id)
  end
end