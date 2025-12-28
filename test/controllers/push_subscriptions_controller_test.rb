require "test_helper"

class PushSubscriptionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    # Set a test VAPID key for testing
    ENV["VAPID_PUBLIC_KEY"] = "test-vapid-public-key-for-testing-purposes-1234567890"
  end

  test "vapid_public_key returns key without authentication" do
    get push_vapid_public_key_path
    assert_response :success

    json = JSON.parse(response.body)
    assert json.key?("vapid_public_key")
    assert_equal "test-vapid-public-key-for-testing-purposes-1234567890", json["vapid_public_key"]
  end

  test "subscribe creates new push subscription" do
    sign_in_as "Ivor"

    assert_difference "PushSubscription.count", 1 do
      post push_subscribe_path, params: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-123",
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
        auth: "tBHItJI5svbpez7KI4CCXg"
      }, as: :json
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert json["ok"]
  end

  test "subscribe updates existing subscription" do
    sign_in_as "Ivor"

    # Create initial subscription
    post push_subscribe_path, params: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-456",
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      auth: "old-auth-key"
    }, as: :json

    # Update with new auth key
    assert_no_difference "PushSubscription.count" do
      post push_subscribe_path, params: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-456",
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
        auth: "new-auth-key"
      }, as: :json
    end

    assert_response :success
    subscription = PushSubscription.find_by(endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-456")
    assert_equal "new-auth-key", subscription.auth
  end

  test "unsubscribe removes subscription" do
    sign_in_as "Ivor"

    # Create subscription first
    post push_subscribe_path, params: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-789",
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      auth: "test-auth"
    }, as: :json

    assert_difference "PushSubscription.count", -1 do
      delete push_unsubscribe_path, params: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-789"
      }, as: :json
    end

    assert_response :success
  end
end
