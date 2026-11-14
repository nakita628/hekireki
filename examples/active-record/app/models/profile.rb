# One per user: a has_one from the user's side, destroyed with the user.
class Profile < ApplicationRecord
  validates :user_id, uniqueness: true
  validates :bio, length: { maximum: 140 }

  belongs_to :user
end
