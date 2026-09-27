class Session < ApplicationRecord
  attribute :created_at, PrismaDateTime.new, default: -> { Time.current }
  attribute :updated_at, PrismaDateTime.new

  belongs_to :user, inverse_of: :sessions
end
