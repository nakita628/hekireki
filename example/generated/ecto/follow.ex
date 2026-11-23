defmodule Example.Follow do
  @moduledoc """
  Composite primary key + two named relations to the same model.
  """

  use Ecto.Schema

  @primary_key false

  @type t :: %__MODULE__{
          follower_id: String.t(),
          following_id: String.t(),
          since: DateTime.t(),
          follower: Example.User.t() | nil,
          following: Example.User.t() | nil
        }

  schema "follows" do
    field(:since, Example.PrismaDateTime, autogenerate: true)
    field(:follower_id, :string, primary_key: true)
    field(:following_id, :string, primary_key: true)
    belongs_to(:follower, Example.User, foreign_key: :follower_id, define_field: false, type: :string)
    belongs_to(:following, Example.User, foreign_key: :following_id, define_field: false, type: :string)
  end
end