# Composite primary key + two named relations to the same model.
class Follow < ApplicationRecord
  self.table_name = "follows"
  self.primary_key = ["follower_id", "following_id"]

  belongs_to :follower, class_name: "User", foreign_key: "follower_id"
  belongs_to :following, class_name: "User", foreign_key: "following_id"
end