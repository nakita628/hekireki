defmodule Example.Tag do
  use Ecto.Schema
  @moduledoc """
  Implicit many-to-many partner of Post (join table `_PostToTag`).
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          label: String.t(),
          posts: [Example.Post.t()]
        }

  schema "tag" do
    field(:label, :string)
    many_to_many(:posts, Example.Post, join_through: "_PostToTag", join_keys: [B: :id, A: :id])
  end
end