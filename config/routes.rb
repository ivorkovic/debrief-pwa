Rails.application.routes.draw do
  # Authentication
  get "login", to: "sessions#new"
  post "login", to: "sessions#create"
  delete "logout", to: "sessions#destroy"

  # Debriefs
  resources :debriefs, only: [ :index, :show, :new, :create, :destroy ] do
    member do
      post :resend
    end
  end

  # Internal API (localhost only via SSH tunnel)
  namespace :api do
    get "unnotified", to: "notifications#index"
    post "notifications/:id/ack", to: "notifications#ack"
    post "debriefs/:id/complete", to: "notifications#complete"
  end

  # Push notifications
  get "push/vapid_public_key", to: "push_subscriptions#vapid_public_key"
  post "push/subscribe", to: "push_subscriptions#create"
  delete "push/unsubscribe", to: "push_subscriptions#destroy"

  # Root
  root "debriefs#new"

  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # PWA files
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
end
