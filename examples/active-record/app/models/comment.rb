class Comment < ApplicationRecord
  validates :body, presence: true
  validates :slot, presence: true, uniqueness: { scope: :post_id }

  belongs_to :post, inverse_of: :comments
  belongs_to :user, inverse_of: :comments
  belongs_to :parent, class_name: "Comment", optional: true, inverse_of: :replies
  has_many :replies, class_name: "Comment", foreign_key: "parent_id", inverse_of: :parent, dependent: :nullify
end
