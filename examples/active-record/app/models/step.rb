# A workflow step whose enum Rails cannot name the usual ways: `type_condition` is Active
# Record's own (single-table inheritance), so the keys carry the suffix (`condition_type?`), and
# `values` is ActiveRecord::Relation's, so `value` is no enum but its stored values, validated.
class Step < ApplicationRecord
  self.inheritance_column = nil

  enum :type, { trigger: "TRIGGER", condition: "CONDITION", exit: "EXIT" }, default: :trigger, suffix: true,
                                                                            validate: true
  attribute :value, default: "LOW"
  validates :value, inclusion: { in: %w[LOW HIGH] }
end
