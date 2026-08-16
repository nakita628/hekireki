# One-to-one relation with native @db.* types, literal defaults,
# and optional scalars of every flavour.
class Profile < ApplicationRecord
  self.table_name = "profile"

  belongs_to :user, class_name: "User", foreign_key: "user_id"
end