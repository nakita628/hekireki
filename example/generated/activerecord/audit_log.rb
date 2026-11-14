# DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
class AuditLog < ApplicationRecord
  attribute :payload, default: -> { JSON.parse("{}") }

  validates :action, presence: true
end
