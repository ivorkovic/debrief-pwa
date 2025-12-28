class MagicLink < ApplicationRecord
  belongs_to :identity

  validates :code, presence: true, uniqueness: true
  validates :expires_at, presence: true

  before_validation :generate_code, on: :create
  before_validation :set_expiration, on: :create

  scope :valid, -> { where("expires_at > ?", Time.current) }

  def expired?
    expires_at <= Time.current
  end

  def consume!
    destroy!
  end

  private

  def generate_code
    self.code ||= SecureRandom.random_number(10**6).to_s.rjust(6, "0")
  end

  def set_expiration
    self.expires_at ||= 15.minutes.from_now
  end
end
