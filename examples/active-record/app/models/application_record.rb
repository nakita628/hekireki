class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  class PrismaDateTime < ActiveRecord::Type::DateTime
    def serialize(value)
      time = super
      time.respond_to?(:getutc) ? time.getutc.strftime("%Y-%m-%dT%H:%M:%S.%L+00:00") : time
    end
  end
end
