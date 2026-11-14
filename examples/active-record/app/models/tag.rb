# A random primary key: `first` and `last` order by the created timestamp instead.
class Tag < ApplicationRecord
  self.implicit_order_column = "created_at"

  attribute :id, default: -> { SecureRandom.uuid }
  attribute :created_at, PrismaDateTime.new, default: -> { Time.current }

  validates :name, presence: true, uniqueness: true

  has_many :post_tags, dependent: :destroy

  has_many :posts, through: :post_tags
end
