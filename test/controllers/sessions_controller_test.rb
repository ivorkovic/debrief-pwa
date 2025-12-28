require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @identity = Identity.find_or_create_by!(email_address: "ivor.kovic@fiumed.hr")
    @user = @identity.users.find_or_create_by!(name: "Ivor")
  end

  test "login page renders" do
    get new_session_path
    assert_response :success
    assert_select "h1", "Debrief"
  end

  test "valid email sends magic link" do
    assert_enqueued_emails 1 do
      post session_path, params: { email: "ivor.kovic@fiumed.hr" }
    end
    assert_redirected_to verify_session_path(email: "ivor.kovic@fiumed.hr")
  end

  test "invalid email stays on login page with error" do
    post session_path, params: { email: "unknown@example.com" }
    assert_response :unprocessable_entity
  end

  test "verify page renders" do
    get verify_session_path(email: "ivor.kovic@fiumed.hr")
    assert_response :success
  end

  test "valid code creates session and redirects" do
    magic_link = @identity.magic_links.create!
    post confirm_session_path, params: { email: "ivor.kovic@fiumed.hr", code: magic_link.code }
    assert_redirected_to root_path
    assert_nil MagicLink.find_by(id: magic_link.id), "Magic link should be consumed"
  end

  test "invalid code stays on verify page with error" do
    post confirm_session_path, params: { email: "ivor.kovic@fiumed.hr", code: "000000" }
    assert_response :unprocessable_entity
  end

  test "expired code is rejected" do
    magic_link = @identity.magic_links.create!
    magic_link.update!(expires_at: 1.hour.ago)
    post confirm_session_path, params: { email: "ivor.kovic@fiumed.hr", code: magic_link.code }
    assert_response :unprocessable_entity
  end

  test "logout destroys session" do
    sign_in_as "Ivor"
    delete session_path
    assert_redirected_to new_session_path
  end

  test "unauthenticated request redirects to login" do
    get root_path
    assert_redirected_to new_session_path
  end
end
