class DebriefsController < ApplicationController
  before_action :set_debrief, only: [ :show, :destroy, :resend ]

  def index
    @debriefs = Debrief.recent.limit(50)
  end

  def show
  end

  def new
    @debrief = Debrief.new
  end

  def create
    @debrief = Debrief.new(recorded_by: session[:user])
    @debrief.audio.attach(params[:audio])

    if @debrief.save
      TranscribeJob.perform_later(@debrief)
      redirect_to debriefs_path, notice: "Recording uploaded. Transcription in progress..."
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
    @debrief = Debrief.find(params[:id])
  end
end
