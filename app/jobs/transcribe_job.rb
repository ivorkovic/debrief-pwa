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
    return unless Rails.application.credentials.dig(:agent, :notify)

    # Write transcript to temp file
    timestamp = debrief.created_at.strftime("%Y-%m-%d-%H-%M-%S")
    transcript_path = "/tmp/debrief_#{timestamp}.md"

    File.write(transcript_path, <<~MARKDOWN)
      # Debrief #{debrief.created_at.strftime("%Y-%m-%d %H:%M")}

      #{debrief.transcript}
    MARKDOWN

    # Notify root agent via tmux
    system("tmux send-keys -t root 'DEBRIEF: #{transcript_path}' Enter")
  end
end
