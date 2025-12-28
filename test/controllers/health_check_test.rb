require "test_helper"

class HealthCheckTest < ActionDispatch::IntegrationTest
  test "health check returns success" do
    get rails_health_check_path
    assert_response :success
  end

  test "service worker file exists with correct cache version" do
    sw_path = Rails.root.join("app/views/pwa/service-worker.js")
    assert File.exist?(sw_path), "Service worker file should exist"

    content = File.read(sw_path)
    assert_includes content, "CACHE_VERSION"
    assert_includes content, "debrief-"
    assert_match(/CACHE_VERSION = 'v\d+'/, content)
  end

  test "service worker filters non-HTTP protocols (Brave fix)" do
    sw_path = Rails.root.join("app/views/pwa/service-worker.js")
    content = File.read(sw_path)
    # Verify the Brave fix is in place
    assert_includes content, "protocol.startsWith('http')", "Service worker should filter non-HTTP protocols"
  end

  test "manifest file exists with required fields" do
    manifest_path = Rails.root.join("app/views/pwa/manifest.json.erb")
    assert File.exist?(manifest_path), "Manifest file should exist"

    content = File.read(manifest_path)
    assert_includes content, '"name"'
    assert_includes content, '"Debrief"'
    assert_includes content, '"standalone"'
    assert_includes content, "gcm_sender_id", "Manifest should have gcm_sender_id for Chrome"
  end
end
