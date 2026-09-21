class Comment < ApplicationRecord
  validates :body, presence: true

  belongs_to :post, inverse_of: :comments
  belongs_to :author, class_name: "User", optional: true, inverse_of: :comments
end
