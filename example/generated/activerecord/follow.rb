class Follow < ApplicationRecord
  self.primary_key = %w[follower_id following_id]

  belongs_to :follower, class_name: "User", inverse_of: :following
  belongs_to :following, class_name: "User", inverse_of: :followers
end
