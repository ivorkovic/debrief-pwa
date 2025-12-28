require "net/http"
require "uri"

class NotifyJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: 5.seconds, attempts: 3

  def perform(debrief)
    return unless debrief.done?

    uri = URI("http://host.docker.internal:9999/notify")

    request = Net::HTTP::Post.new(uri)
    request.content_type = "application/json"
    request.body = {
      id: debrief.id,
      transcript: debrief.transcript,
      recorded_by: debrief.recorded_by,
      created_at: debrief.created_at.strftime("%Y-%m-%d %H:%M")
    }.to_json

    Net::HTTP.start(uri.hostname, uri.port, open_timeout: 2, read_timeout: 5) do |http|
      http.request(request)
    end

    debrief.update!(notified_at: Time.current)
  rescue Errno::ECONNREFUSED, Errno::ETIMEDOUT, Errno::EHOSTUNREACH, Errno::ENETUNREACH,
         SocketError, Net::OpenTimeout, Net::ReadTimeout => e
    # Mac is offline or tunnel not connected - that's ok, Mac will catch up via /api/unnotified
    Rails.logger.info "Notification skipped (Mac offline): #{e.message}"
  end
end
