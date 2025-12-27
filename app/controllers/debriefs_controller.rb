class DebriefsController < ApplicationController
  def index
    @debriefs = Debrief.recent.limit(50)
  end

  def show
    @debrief = Debrief.find(params[:id])
  end

  def new
    @debrief = Debrief.new
  end

  def create
    @debrief = Debrief.new
    @debrief.audio.attach(params[:audio])

    if @debrief.save
      TranscribeJob.perform_later(@debrief)
      redirect_to debriefs_path, notice: "Recording uploaded. Transcription in progress..."
    else
      render :new, status: :unprocessable_entity
    end
  end
end
