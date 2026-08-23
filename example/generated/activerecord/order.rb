# BigInt autoincrement primary key (bigserial) and money as Decimal.
class Order < ApplicationRecord
  self.table_name = "orders"

  belongs_to :user, class_name: "User", foreign_key: "user_id"
  has_many :items, class_name: "OrderItem", foreign_key: "order_id"
end