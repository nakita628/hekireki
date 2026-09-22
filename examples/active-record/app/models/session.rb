class Session < ApplicationRecord
  belongs_to :user, inverse_of: :sessions
end
