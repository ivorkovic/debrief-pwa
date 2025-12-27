require "net/http"
require "uri"

class TranscribeJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform(debrief)
    debrief.update!(status: :transcribing)

    transcript = transcribe_with_groq(debrief)

    debrief.update!(
      transcript: transcript,
      status: :done,
      processed_at: Time.current
    )

    notify_agent(debrief)
  rescue StandardError => e
    debrief.update!(
      status: :failed,
      error_message: e.message
    )
    raise
  end

  private

  def transcribe_with_groq(debrief)
    api_key = Rails.application.credentials.dig(:groq, :api_key)
    raise "Groq API key not configured" unless api_key

    # Download audio to temp file
    audio_file = debrief.audio.download
    temp_file = Tempfile.new([ "audio", ".#{debrief.audio.filename.extension}" ])
    temp_file.binmode
    temp_file.write(audio_file)
    temp_file.rewind

    # Call Groq Whisper API
    uri = URI("https://api.groq.com/openai/v1/audio/transcriptions")

    request = Net::HTTP::Post.new(uri)
    request["Authorization"] = "Bearer #{api_key}"

    form_data = [
      [ "file", temp_file, { filename: debrief.audio.filename.to_s } ],
      [ "model", "whisper-large-v3" ],
      [ "response_format", "text" ],
      [ "language", "en" ]
    ]

    request.set_form(form_data, "multipart/form-data")

    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
      http.request(request)
    end

    temp_file.close
    temp_file.unlink

    unless response.is_a?(Net::HTTPSuccess)
      raise "Groq API error: #{response.code} - #{response.body}"
    end

    response.body.strip
  end

  def notify_agent(debrief)
    # Try to notify via SSH tunnel to Mac (host:9999)
    # If Mac is offline, that's fine - it will catch up on reconnect
    # Use host.docker.internal to reach the Docker host from inside container
    uri = URI("http://host.docker.internal:9999/notify")

    request = Net::HTTP::Post.new(uri)
    request.content_type = "application/json"
    request.body = {
      id: debrief.id,
      transcript: debrief.transcript,
      created_at: debrief.created_at.strftime("%Y-%m-%d %H:%M")
    }.to_json

    Net::HTTP.start(uri.hostname, uri.port, open_timeout: 2, read_timeout: 5) do |http|
      http.request(request)
    end

    debrief.update!(notified_at: Time.current)
  rescue Errno::ECONNREFUSED, Errno::ETIMEDOUT, Net::OpenTimeout, Net::ReadTimeout => e
    # Mac is offline or tunnel not connected - that's ok, it will catch up
    Rails.logger.info "Notification skipped (Mac offline): #{e.message}"
  end
end
