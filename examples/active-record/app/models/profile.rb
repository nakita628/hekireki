class Profile < ApplicationRecord
  validates :user_id, uniqueness: true
  validates :bio, length: { maximum: 140 }

  belongs_to :user
end
