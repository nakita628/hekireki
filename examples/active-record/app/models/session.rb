# A signed-in browser. Rails reports a missing belongs_to on the association, `user`, and reads
# the column's name for `user_id`: each has its own @ar.name.
class Session < ApplicationRecord
  attribute :created_at, PrismaDateTime.new, default: -> { Time.current }
  attribute :updated_at, PrismaDateTime.new

  belongs_to :user, inverse_of: :sessions
end
