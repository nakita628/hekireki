class Profile < ApplicationRecord
  self.table_name = "Profile"

  attribute :id, default: -> { Cuid2.call }
  attribute :nickname, default: "anonymous"
  attribute :balance, default: BigDecimal("0")
  attribute :verified, default: false

  validates :user_id, uniqueness: true
  validates :nickname, length: { maximum: 64 }

  belongs_to :user
end
