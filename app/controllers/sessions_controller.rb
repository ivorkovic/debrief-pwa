class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[new create verify confirm]

  def new
  end

  def create
    if (identity = Identity.find_by(email_address: params[:email]))
      magic_link = identity.magic_links.create!
      # TODO: Enable email when domain is verified in Resend
      # AuthenticationMailer.magic_link(identity, magic_link).deliver_later
      redirect_to verify_session_path(email: identity.email_address, code: magic_link.code)
    else
      flash.now[:alert] = "Email not found"
      render :new, status: :unprocessable_entity
    end
  end

  def verify
    @email = params[:email]
    @code = params[:code]
  end

  def confirm
    identity = Identity.find_by(email_address: params[:email])
    magic_link = identity&.magic_links&.valid&.find_by(code: params[:code])

    if magic_link
      magic_link.consume!
      start_session(identity, user_agent: request.user_agent, ip_address: request.remote_ip)
      redirect_to root_path, notice: "Signed in successfully"
    else
      flash.now[:alert] = "Invalid or expired code"
      @email = params[:email]
      render :verify, status: :unprocessable_entity
    end
  end

  def destroy
    end_session
    redirect_to new_session_path, notice: "Signed out"
  end
end
