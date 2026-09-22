class PostTag < ApplicationRecord
  self.primary_key = %w[post_id tag_id]

  belongs_to :post, inverse_of: :post_tags
  belongs_to :tag, inverse_of: :post_tags
end
