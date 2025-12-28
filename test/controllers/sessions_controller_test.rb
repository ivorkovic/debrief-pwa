require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  test "login page renders" do
    get login_path
    assert_response :success
    assert_select "h1", "Debrief"
  end

  test "valid PIN logs in Ivor" do
    post login_path, params: { pin: "17121984" }
    assert_redirected_to root_path
    follow_redirect!
    assert_response :success
  end

  test "valid PIN logs in Marija" do
    post login_path, params: { pin: "15062016" }
    assert_redirected_to root_path
    follow_redirect!
    assert_response :success
  end

  test "invalid PIN stays on login page with error" do
    post login_path, params: { pin: "00000000" }
    assert_response :unprocessable_entity
  end

  test "logout destroys session" do
    sign_in_as "Ivor"
    delete logout_path
    assert_redirected_to login_path
  end

  test "unauthenticated request redirects to login" do
    get root_path
    assert_redirected_to login_path
  end
end
