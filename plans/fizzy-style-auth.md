# Plan: Fizzy-Style Authentication for Debrief

## Overview

Replace PIN-based login with Fizzy's magic link pattern:
- Email + 6-digit code (no passwords)
- Long-lived sessions (weeks/months)
- Multi-device support (phone + computer simultaneously)
- User-scoped push notifications

## Current State

| Component | Current | Problem |
|-----------|---------|---------|
| Login | PIN codes (17121984, 15062016) | Not secure, stored in code |
| Session | Cookie with `authenticated: true, user: "Ivor"` | No real session model, expires often |
| Push Subscriptions | No user association | Everyone gets all notifications |
| Users | Just a string (`recorded_by`) | No proper user model |

## Target State (Fizzy Pattern)

```
Identity (email holder)
├── has_many :magic_links
├── has_many :sessions
└── has_one :user

Session (persistent login token)
└── belongs_to :identity

User (profile)
├── belongs_to :identity
├── has_many :debriefs
└── has_many :push_subscriptions

MagicLink (6-digit codes)
└── belongs_to :identity
```

---

## Implementation Steps

### Phase 1: Database Migrations (5 files)

#### 1.1 Create identities table
```ruby
create_table :identities do |t|
  t.string :email_address, null: false, index: { unique: true }
  t.timestamps
end
```

#### 1.2 Create magic_links table
```ruby
create_table :magic_links do |t|
  t.references :identity, null: false, foreign_key: true
  t.string :code, null: false
  t.string :purpose, default: "sign_in"  # sign_in or sign_up
  t.datetime :expires_at, null: false
  t.timestamps
end
add_index :magic_links, :code, unique: true
```

#### 1.3 Create sessions table
```ruby
create_table :sessions do |t|
  t.references :identity, null: false, foreign_key: true
  t.string :token, null: false, index: { unique: true }
  t.string :user_agent
  t.string :ip_address
  t.datetime :last_active_at
  t.timestamps
end
```

#### 1.4 Create users table
```ruby
create_table :users do |t|
  t.references :identity, null: false, foreign_key: true
  t.string :name, null: false
  t.timestamps
end
```

#### 1.5 Update existing tables
```ruby
# Add user_id to debriefs (keep recorded_by for now, migrate later)
add_reference :debriefs, :user, foreign_key: true

# Add user_id to push_subscriptions
add_reference :push_subscriptions, :user, foreign_key: true
```

---

### Phase 2: Models (5 files)

#### 2.1 Identity model
```ruby
class Identity < ApplicationRecord
  has_many :magic_links, dependent: :destroy
  has_many :sessions, dependent: :destroy
  has_one :user, dependent: :destroy

  validates :email_address, presence: true, uniqueness: true,
    format: { with: URI::MailTo::EMAIL_REGEXP }

  normalizes :email_address, with: ->(e) { e.strip.downcase }

  def send_magic_link
    code = magic_links.create!
    AuthenticationMailer.magic_link(self, code).deliver_later
    code
  end
end
```

#### 2.2 MagicLink model
```ruby
class MagicLink < ApplicationRecord
  CODE_LENGTH = 6
  EXPIRATION_TIME = 15.minutes

  belongs_to :identity

  before_create :generate_code, :set_expires_at

  scope :active, -> { where("expires_at > ?", Time.current) }
  scope :stale, -> { where("expires_at <= ?", Time.current) }

  def self.consume(code)
    active.find_by(code: code.upcase)&.tap(&:destroy!)
  end

  def self.cleanup
    stale.delete_all
  end

  private

  def generate_code
    loop do
      self.code = SecureRandom.alphanumeric(CODE_LENGTH).upcase
      break unless MagicLink.exists?(code: code)
    end
  end

  def set_expires_at
    self.expires_at = EXPIRATION_TIME.from_now
  end
end
```

#### 2.3 Session model
```ruby
class Session < ApplicationRecord
  ACTIVITY_REFRESH_RATE = 1.hour

  belongs_to :identity
  has_secure_token

  before_create { self.last_active_at ||= Time.current }

  def resume(user_agent:, ip_address:)
    if last_active_at.before?(ACTIVITY_REFRESH_RATE.ago)
      update!(user_agent: user_agent, ip_address: ip_address, last_active_at: Time.current)
    end
  end

  def user
    identity.user
  end
end
```

#### 2.4 User model
```ruby
class User < ApplicationRecord
  belongs_to :identity

  has_many :debriefs, dependent: :nullify
  has_many :push_subscriptions, dependent: :destroy

  validates :name, presence: true

  delegate :email_address, to: :identity
end
```

#### 2.5 Update PushSubscription model
```ruby
class PushSubscription < ApplicationRecord
  belongs_to :user
end
```

---

### Phase 3: Authentication Concern

```ruby
# app/controllers/concerns/authentication.rb
module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :signed_in?, :current_user
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  private

  def signed_in?
    current_user.present?
  end

  def current_user
    @current_user ||= current_session&.user
  end

  def current_session
    @current_session ||= find_session_by_cookie
  end

  def find_session_by_cookie
    return unless (token = cookies.signed[:session_token])
    Session.find_by(token: token)&.tap do |session|
      session.resume(user_agent: request.user_agent, ip_address: request.remote_ip)
    end
  end

  def require_authentication
    redirect_to login_path unless signed_in?
  end

  def start_new_session_for(identity)
    session = identity.sessions.create!(
      user_agent: request.user_agent,
      ip_address: request.remote_ip
    )
    cookies.signed.permanent[:session_token] = {
      value: session.token,
      httponly: true,
      same_site: :lax
    }
  end

  def terminate_session
    current_session&.destroy
    cookies.delete(:session_token)
  end
end
```

---

### Phase 4: Controllers

#### 4.1 SessionsController (login flow)
```ruby
class SessionsController < ApplicationController
  allow_unauthenticated_access
  rate_limit to: 10, within: 3.minutes, only: :create

  def new
    # Show email input form
  end

  def create
    if (identity = Identity.find_by(email_address: params[:email]))
      identity.send_magic_link
      redirect_to verify_session_path(email: identity.email_address),
        notice: "Check your email for a 6-digit code"
    else
      redirect_to login_path, alert: "Email not found"
    end
  end

  def verify
    @email = params[:email]
    # Show code input form
  end

  def confirm
    if (magic_link = MagicLink.consume(params[:code]))
      start_new_session_for(magic_link.identity)
      redirect_to root_path, notice: "Welcome back!"
    else
      redirect_to verify_session_path(email: params[:email]),
        alert: "Invalid or expired code"
    end
  end

  def destroy
    # Also delete push subscriptions for this device
    current_user.push_subscriptions
      .where(user_agent: request.user_agent)
      .destroy_all

    terminate_session
    redirect_to login_path, notice: "Logged out"
  end
end
```

#### 4.2 Update routes
```ruby
# Authentication
get "login", to: "sessions#new"
post "login", to: "sessions#create"
get "verify", to: "sessions#verify", as: :verify_session
post "verify", to: "sessions#confirm"
delete "logout", to: "sessions#destroy"
```

---

### Phase 5: Mailer

#### 5.1 AuthenticationMailer
```ruby
class AuthenticationMailer < ApplicationMailer
  def magic_link(identity, magic_link)
    @identity = identity
    @code = magic_link.code

    mail(
      to: identity.email_address,
      subject: "Your Debrief login code: #{@code}"
    )
  end
end
```

#### 5.2 Email template (text)
```erb
Your login code for Debrief is:

<%= @code %>

This code expires in 15 minutes.

If you didn't request this, you can safely ignore this email.
```

---

### Phase 6: SMTP Configuration

**Option A: Resend (Recommended - Simplest)**
- Free tier: 3,000 emails/month
- Simple API key setup
- No OAuth complexity

```ruby
# Gemfile
gem "resend"

# config/environments/production.rb
config.action_mailer.delivery_method = :resend
config.action_mailer.resend_settings = {
  api_key: ENV["RESEND_API_KEY"]
}
```

**Option B: Google Workspace SMTP**
- Requires App Password (2FA must be enabled)
- More complex setup

**Option C: Postmark**
- Similar to Resend, very reliable

---

### Phase 7: Fix Push Notifications

#### 7.1 Update PushSubscriptionsController
```ruby
def create
  subscription = current_user.push_subscriptions.find_or_initialize_by(endpoint: params[:endpoint])
  subscription.update!(p256dh: params[:p256dh], auth: params[:auth], user_agent: request.user_agent)
  render json: { ok: true }
end
```

#### 7.2 Update PushNotificationJob
```ruby
def perform(debrief)
  return unless debrief.completion_summary.present?
  return unless debrief.user  # Must have user

  message = {
    title: "Task Completed",
    body: debrief.completion_summary.truncate(100),
    icon: "/icon.png",
    data: { path: "/debriefs/#{debrief.id}" }
  }

  # Only send to the user who recorded this debrief
  debrief.user.push_subscriptions.find_each do |subscription|
    send_notification(subscription, message)
  rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
    subscription.destroy
  rescue => e
    Rails.logger.error "Push notification failed: #{e.message}"
  end
end
```

---

### Phase 8: Seed Data

```ruby
# db/seeds.rb
Identity.find_or_create_by!(email_address: "ivor@fiumed.hr") do |identity|
  identity.build_user(name: "Ivor")
end

Identity.find_or_create_by!(email_address: "marija@fiumed.hr") do |identity|
  identity.build_user(name: "Marija")
end
```

---

### Phase 9: Data Migration

```ruby
# Migrate existing debriefs to new user model
ivor = User.find_by!(name: "Ivor")
marija = User.find_by!(name: "Marija")

Debrief.where(recorded_by: "Ivor").update_all(user_id: ivor.id)
Debrief.where(recorded_by: "Marija").update_all(user_id: marija.id)
```

---

## Files to Create/Modify

### New Files (12)
- `db/migrate/*_create_identities.rb`
- `db/migrate/*_create_magic_links.rb`
- `db/migrate/*_create_sessions.rb`
- `db/migrate/*_create_users.rb`
- `db/migrate/*_add_user_to_tables.rb`
- `app/models/identity.rb`
- `app/models/magic_link.rb`
- `app/models/session.rb`
- `app/models/user.rb`
- `app/controllers/concerns/authentication.rb`
- `app/mailers/authentication_mailer.rb`
- `app/views/authentication_mailer/magic_link.text.erb`

### Modified Files (8)
- `app/models/debrief.rb` - add belongs_to :user
- `app/models/push_subscription.rb` - add belongs_to :user
- `app/controllers/application_controller.rb` - include Authentication
- `app/controllers/sessions_controller.rb` - rewrite for magic links
- `app/controllers/push_subscriptions_controller.rb` - scope to current_user
- `app/jobs/push_notification_job.rb` - filter by debrief.user
- `config/routes.rb` - update auth routes
- `config/environments/production.rb` - add mailer config

### Views (4)
- `app/views/sessions/new.html.erb` - email input
- `app/views/sessions/verify.html.erb` - code input
- Update existing views to use `current_user` instead of `session[:user]`

---

## Testing Plan

1. **Unit tests** for Identity, MagicLink, Session, User models
2. **Integration tests** for login flow
3. **Manual testing:**
   - Login on iPhone (Ivor)
   - Login on Mac (Ivor) - should work simultaneously
   - Login on iPhone (Marija)
   - Record debrief as Ivor → only Ivor gets notification
   - Record debrief as Marija → only Marija gets notification

---

## Rollout Plan

1. Deploy with both PIN and magic link enabled (feature flag)
2. Test magic link flow end-to-end
3. Disable PIN login
4. Remove PIN code from codebase

---

## Time Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Migrations | 30 min |
| Phase 2: Models | 45 min |
| Phase 3: Auth Concern | 30 min |
| Phase 4: Controllers | 45 min |
| Phase 5: Mailer | 20 min |
| Phase 6: SMTP Setup | 15 min |
| Phase 7: Fix Notifications | 20 min |
| Phase 8-9: Seeds & Migration | 15 min |
| Views & Testing | 1 hour |
| **Total** | ~4-5 hours |

---

## SMTP Recommendation

**Use Resend** - I can set this up without needing anything from you:
1. Create account at resend.com
2. Get API key
3. Verify domain (add DNS records)
4. Done

Or if you prefer Google Workspace, I'll need you to:
1. Enable 2FA on your Google account
2. Generate an App Password
3. Share the App Password (securely)

---

## Questions Before Starting

1. **Email addresses:** Is it `ivor@fiumed.hr` and `marija@fiumed.hr`? Or different domain?

2. **SMTP choice:** Resend (I can set up) or Google Workspace (need your help)?

3. **Session duration:** How long should sessions last before requiring re-login? Fizzy seems to be weeks/months. I'd suggest 90 days.

4. **Feature flag:** Want both PIN and magic link during transition, or just switch over?
