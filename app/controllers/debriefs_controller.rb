class DebriefsController < ApplicationController
  # PWA caches pages with stale CSRF tokens - skip for uploads (auth still required)
  skip_before_action :verify_authenticity_token, only: [ :create ]
  before_action :set_debrief, only: [ :show, :destroy, :resend ]

  def index
    @debriefs = current_user.debriefs.recent.limit(50)
  end

  def show
  end

  def new
    @debrief = Debrief.new
  end

  def create
    @debrief = current_user.debriefs.new(recorded_by: current_user.name)

    if params[:entry_type] == "text"
      # Text entry: set transcript directly, skip transcription job
      @debrief.entry_type = :text
      @debrief.transcript = params[:text_content]
      @debrief.status = :done
      @debrief.processed_at = Time.current

      # Attach any files (images, PDFs, etc.)
      if params[:attachments].present?
        Array(params[:attachments]).each do |file|
          @debrief.attachments.attach(file) if file.present?
        end
      end
    else
      # Audio entry: attach file, queue transcription
      @debrief.entry_type = :audio
      @debrief.audio.attach(params[:audio])
    end

    if @debrief.save
      if @debrief.audio?
        TranscribeJob.perform_later(@debrief)
        redirect_to debriefs_path, notice: "Recording uploaded. Transcription in progress..."
      else
        # Text entries notify immediately (already done status)
        NotifyJob.perform_later(@debrief)
        redirect_to debriefs_path, notice: "Message sent."
      end
    else
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    @debrief.destroy
    redirect_to debriefs_path, notice: "Recording deleted."
  end

  def resend
    if @debrief.done?
      # Clear notified_at to trigger re-notification (also enables catchup via /api/unnotified)
      @debrief.update!(notified_at: nil)
      NotifyJob.perform_later(@debrief)
      redirect_to @debrief, notice: "Queued for Claude. Check your Mac listener is running."
    else
      redirect_to @debrief, alert: "Can only resend completed transcriptions."
    end
  end

  private

  def set_debrief
    @debrief = current_user.debriefs.find(params[:id])
  end
end
