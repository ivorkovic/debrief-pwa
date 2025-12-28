module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :authenticated?, :current_session, :current_user
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  private

  def authenticated?
    current_session.present?
  end

  def require_authentication
    restore_session || redirect_to_login
  end

  def current_session
    @current_session ||= find_session_by_cookie
  end

  def current_user
    current_session&.user
  end

  def start_session(identity, user_agent: nil, ip_address: nil)
    session = identity.sessions.create!(
      user_agent: user_agent,
      ip_address: ip_address,
      last_active_at: Time.current
    )
    set_session_cookie(session.token)
    session
  end

  def end_session
    current_session&.destroy
    delete_session_cookie
  end

  def restore_session
    if (session = find_session_by_cookie)
      session.touch_last_active!
      @current_session = session
    end
  end

  def find_session_by_cookie
    if (token = cookies.signed[:session_token])
      Session.find_by(token: token)
    end
  end

  def set_session_cookie(token)
    cookies.signed[:session_token] = {
      value: token,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :lax,
      expires: 90.days.from_now
    }
  end

  def delete_session_cookie
    cookies.delete(:session_token)
  end

  def redirect_to_login
    redirect_to new_session_path
  end
end
