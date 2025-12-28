class User < ApplicationRecord
  belongs_to :identity
  has_many :debriefs, dependent: :nullify
  has_many :push_subscriptions, dependent: :destroy

  validates :name, presence: true

  delegate :email_address, to: :identity
end
