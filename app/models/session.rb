class Session < ApplicationRecord
  belongs_to :identity

  has_secure_token

  validates :token, presence: true, uniqueness: true

  before_validation :set_token, on: :create

  def touch_last_active!
    update!(last_active_at: Time.current)
  end

  def user
    identity.users.first
  end

  private

  def set_token
    self.token ||= self.class.generate_unique_secure_token
  end
end
