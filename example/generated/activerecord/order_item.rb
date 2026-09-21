class OrderItem < ApplicationRecord
  attribute :qty, default: 1

  validates :order_id, uniqueness: { scope: :sku }
  validates :sku, presence: true, length: { maximum: 32 }
  validates :price, presence: true

  belongs_to :order, inverse_of: :items
end
