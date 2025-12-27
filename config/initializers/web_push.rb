# Web Push VAPID configuration
# Keys are stored in environment variables or credentials

Rails.application.config.after_initialize do
  WebPush.configure do |config|
    config.vapid_public_key = ENV.fetch("VAPID_PUBLIC_KEY") {
      Rails.application.credentials.dig(:vapid, :public_key)
    }
    config.vapid_private_key = ENV.fetch("VAPID_PRIVATE_KEY") {
      Rails.application.credentials.dig(:vapid, :private_key)
    }
    config.vapid_subject = "mailto:debrief@fiumed.hr"
  end
end
