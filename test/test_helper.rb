ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

class ActiveSupport::TestCase
  # Run tests in parallel with specified workers
  parallelize(workers: :number_of_processors)

  # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
  # fixtures :all

  # Add more helper methods to be used by all tests here...
end

class ActionDispatch::IntegrationTest
  def sign_in_as(user_name = "Ivor")
    email = user_name == "Ivor" ? "ivor.kovic@fiumed.hr" : "marija.vidacic@fiumed.hr"
    identity = Identity.find_or_create_by!(email_address: email)
    identity.users.find_or_create_by!(name: user_name)
    session = identity.sessions.create!
    cookies[:session_token] = { value: session.token, httponly: true }
  end
end
