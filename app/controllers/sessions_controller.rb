class SessionsController < ApplicationController
  skip_before_action :require_authentication, only: [ :new, :create ]

  def new
  end

  def create
    if params[:pin] == Rails.application.credentials.pin
      session[:authenticated] = true
      redirect_to root_path
    else
      flash.now[:alert] = "Invalid PIN"
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    session[:authenticated] = nil
    redirect_to login_path
  end
end
