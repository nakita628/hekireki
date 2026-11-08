class Step < ApplicationRecord
  self.inheritance_column = nil

  enum :type, { trigger: "TRIGGER", condition: "CONDITION", exit: "EXIT" }, default: :trigger, suffix: true,
                                                                            validate: true
  attribute :value, default: "LOW"
  validates :value, inclusion: { in: %w[LOW HIGH] }
end
