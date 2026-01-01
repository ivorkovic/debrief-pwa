class Debrief < ApplicationRecord
  belongs_to :user, optional: true
  has_one_attached :audio

  enum :status, {
    pending: "pending",
    transcribing: "transcribing",
    done: "done",
    failed: "failed"
  }

  enum :entry_type, {
    audio: "audio",
    text: "text"
  }

  validates :audio, presence: true, if: :audio?
  validates :transcript, presence: true, if: :text?
  validates :status, presence: true
  validates :entry_type, presence: true

  scope :recent, -> { order(created_at: :desc) }
  scope :pending_transcription, -> { where(status: [ :pending, :failed ], entry_type: :audio) }
end
