class SessionsController < ApplicationController
  skip_before_action :require_authentication, only: [ :new, :create ]

  USER_CODES = {
    "17121984" => "Ivor",
    "15062016" => "Marija"
  }.freeze

  def new
  end

  def create
    if (user = USER_CODES[params[:pin]])
      session[:authenticated] = true
      session[:user] = user
      redirect_to root_path
    else
      flash.now[:alert] = "Invalid code"
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    session[:authenticated] = nil
    session[:user] = nil
    redirect_to login_path
  end
end
