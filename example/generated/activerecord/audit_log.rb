class AuditLog < ApplicationRecord
  attribute :payload, default: -> { JSON.parse("{}") }

  validates :action, presence: true
end
