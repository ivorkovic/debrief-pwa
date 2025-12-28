class PushSubscription < ApplicationRecord
  belongs_to :user, optional: true

  scope :for_user, ->(user) { where(user: user) }
end
