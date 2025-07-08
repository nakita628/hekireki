defmodule MyApp.Follow do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "Follow" do
    field(:followerId, :string)
    field(:followingId, :string)
    field(:createdAt, :naive_datetime)
    field(:follower, :string)
    field(:following, :string)
  end
end
