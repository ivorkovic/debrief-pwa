class Debrief < ApplicationRecord
  has_one_attached :audio

  enum :status, {
    pending: "pending",
    transcribing: "transcribing",
    done: "done",
    failed: "failed"
  }

  validates :audio, presence: true
  validates :status, presence: true

  scope :recent, -> { order(created_at: :desc) }
  scope :pending_transcription, -> { where(status: [ :pending, :failed ]) }
end
