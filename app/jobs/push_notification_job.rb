class PushNotificationJob < ApplicationJob
  queue_as :default

  def perform(debrief)
    return unless debrief.completion_summary.present?
    return unless debrief.user.present?

    message = {
      title: "Task Completed",
      body: debrief.completion_summary.truncate(100),
      icon: "/icon.png",
      data: { path: "/debriefs/#{debrief.id}" }
    }

    debrief.user.push_subscriptions.find_each do |subscription|
      send_notification(subscription, message)
    rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
      subscription.destroy
    rescue => e
      Rails.logger.error "Push notification failed: #{e.message}"
    end
  end

  private

  def send_notification(subscription, message)
    WebPush.payload_send(
      message: message.to_json,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      vapid: {
        public_key: vapid_public_key,
        private_key: vapid_private_key,
        subject: "mailto:debrief@fiumed.hr"
      }
    )
  end

  def vapid_public_key
    ENV.fetch("VAPID_PUBLIC_KEY") { Rails.application.credentials.dig(:vapid, :public_key) }
  end

  def vapid_private_key
    ENV.fetch("VAPID_PRIVATE_KEY") { Rails.application.credentials.dig(:vapid, :private_key) }
  end
end
