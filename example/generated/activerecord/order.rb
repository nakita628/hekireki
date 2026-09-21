class Order < ApplicationRecord
  validates :total, presence: true

  belongs_to :user, inverse_of: :orders
  has_many :items, class_name: "OrderItem", inverse_of: :order, dependent: :destroy
end
