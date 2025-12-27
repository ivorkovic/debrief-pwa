Rails.application.routes.draw do
  # Authentication
  get "login", to: "sessions#new"
  post "login", to: "sessions#create"
  delete "logout", to: "sessions#destroy"

  # Debriefs
  resources :debriefs, only: [ :index, :show, :new, :create ]

  # Internal API (localhost only via SSH tunnel)
  namespace :api do
    get "unnotified", to: "notifications#index"
    post "notifications/:id/ack", to: "notifications#ack"
  end

  # Root
  root "debriefs#new"

  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # PWA files
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
end
