class PushSubscriptionsController < ApplicationController
  skip_before_action :require_authentication, only: [ :vapid_public_key ]
  skip_before_action :verify_authenticity_token, only: [ :create ]

  # GET /push/vapid_public_key
  def vapid_public_key
    render json: {
      vapid_public_key: ENV.fetch("VAPID_PUBLIC_KEY") {
        Rails.application.credentials.dig(:vapid, :public_key)
      }
    }
  end

  # POST /push/subscribe
  def create
    subscription = PushSubscription.find_or_initialize_by(endpoint: params[:endpoint])
    subscription.update!(
      p256dh: params[:p256dh],
      auth: params[:auth],
      user_agent: request.user_agent
    )
    render json: { ok: true }
  end

  # DELETE /push/unsubscribe
  def destroy
    PushSubscription.where(endpoint: params[:endpoint]).destroy_all
    render json: { ok: true }
  end
end
