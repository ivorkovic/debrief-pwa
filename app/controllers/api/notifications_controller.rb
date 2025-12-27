module Api
  class NotificationsController < ApplicationController
    skip_before_action :require_authentication
    before_action :verify_local_request

    # GET /api/unnotified - returns transcripts that haven't been notified
    def index
      debriefs = Debrief.where(status: :done, notified_at: nil).order(:created_at)
      render json: debriefs.map { |d| debrief_json(d) }
    end

    # POST /api/notifications/:id/ack - mark as notified
    def ack
      debrief = Debrief.find(params[:id])
      debrief.update!(notified_at: Time.current)
      render json: { ok: true }
    end

    private

    def verify_local_request
      # Only allow requests from localhost (SSH tunnel)
      unless request.remote_ip == "127.0.0.1" || request.remote_ip == "::1"
        head :forbidden
      end
    end

    def debrief_json(debrief)
      {
        id: debrief.id,
        transcript: debrief.transcript,
        created_at: debrief.created_at.strftime("%Y-%m-%d %H:%M")
      }
    end
  end
end
