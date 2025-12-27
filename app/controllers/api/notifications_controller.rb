module Api
  class NotificationsController < ApplicationController
    skip_before_action :require_authentication
    skip_before_action :verify_authenticity_token
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

    # POST /api/debriefs/:id/complete - Claude reports task completion
    def complete
      debrief = Debrief.find(params[:id])
      debrief.update!(
        completion_summary: params[:summary],
        completed_at: Time.current
      )

      # Send push notification to all subscribers
      PushNotificationJob.perform_later(debrief) if debrief.completion_summary.present?

      render json: { ok: true }
    end

    private

    def verify_local_request
      # Only allow requests from localhost or Docker internal network
      ip = request.remote_ip
      unless ip == "127.0.0.1" || ip == "::1" || ip.start_with?("172.")
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
