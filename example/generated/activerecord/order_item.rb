# Child of Order with a composite unique constraint.
class OrderItem < ApplicationRecord
  self.table_name = "order_items"

  belongs_to :order, class_name: "Order", foreign_key: "order_id"
end