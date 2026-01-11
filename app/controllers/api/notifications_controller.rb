module Api
  class NotificationsController < ApplicationController
    include Rails.application.routes.url_helpers

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

    # GET /api/debriefs/:id/status - check if debrief is completed
    def status
      debrief = Debrief.find(params[:id])
      render json: {
        id: debrief.id,
        status: debrief.status,
        completed: debrief.completed_at.present?,
        completed_at: debrief.completed_at&.iso8601
      }
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
        recorded_by: debrief.recorded_by,
        created_at: debrief.created_at.strftime("%Y-%m-%d %H:%M"),
        attachments: build_attachments(debrief)
      }
    end

    def build_attachments(debrief)
      return [] unless debrief.attachments.attached?

      debrief.attachments.map do |attachment|
        {
          filename: attachment.filename.to_s,
          content_type: attachment.content_type,
          url: rails_blob_url(attachment, host: "https://debrief.fiumed.cloud")
        }
      end
    end
  end
end
