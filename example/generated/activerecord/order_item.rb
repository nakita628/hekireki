# Child of Order with a composite unique constraint.
class OrderItem < ApplicationRecord
  attribute :qty, default: 1

  validates :sku, presence: true, length: { maximum: 32 }, uniqueness: { scope: :order_id }
  validates :price, presence: true

  belongs_to :order, inverse_of: :items
end
