# Debrief PWA - Claude Agent Instructions

## Project Overview

Debrief is a voice memo PWA that records audio, transcribes via Groq Whisper, and notifies Claude Code for processing. This is a Rails 8.1 app deployed on Hetzner via Docker.

## Critical Information

### Servers

| Server | IP | Purpose |
|--------|-----|---------|
| **Debrief (this app)** | 46.224.17.255 | Production server |
| Flow (DO NOT TOUCH) | 188.245.246.244 | Different app, production |

**NEVER confuse these servers. Debrief is at 46.224.17.255.**

### Users

| Email | Name | Notes |
|-------|------|-------|
| ivor.kovic@fiumed.hr | Ivor | Primary user |
| marija.vidacic@fiumed.hr | Marija | Secondary user |

### Authentication

Magic link email authentication (Fizzy-style):
1. User enters email → receives 6-digit code via email
2. User enters code → session created (90-day cookie)
3. Sessions stored in `sessions` table with secure token

**Email:** Sent via Google Workspace SMTP (ivor.kovic@fiumed.hr)

### Deployment

```bash
# Commit and push
git add -A && git commit -m "message" && git push origin main

# Deploy to production
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "cd /root/debrief && git pull && docker compose -f docker-compose.production.yml up -d --build"

# Run migrations (if needed)
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker exec debrief-debrief-1 bin/rails db:migrate"

# Run seeds (to add users)
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker exec debrief-debrief-1 bin/rails db:seed"
```

### Check Logs

```bash
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker logs debrief-debrief-1 --tail=100"
```

### Rails Console

```bash
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker exec -it debrief-debrief-1 bin/rails console"
```

## Architecture

See `docs/ARCHITECTURE.md` for full details.

**Key flow:**
1. User records audio in browser
2. Audio uploaded, transcription job queued
3. Groq Whisper transcribes
4. Server notifies Mac via SSH tunnel (port 9999)
5. Mac listener sends to Claude Code
6. Claude processes and calls completion API
7. Push notification sent to user

## Common Issues & Fixes

### Encoding errors with Croatian characters

**Error:** `Encoding::UndefinedConversionError: "\xC4" from ASCII-8BIT to UTF-8`

**Fix in `app/jobs/transcribe_job.rb`:**
```ruby
response.body.force_encoding("UTF-8").encode("UTF-8", invalid: :replace, undef: :replace).strip
```

### Push notifications failing

1. **Chrome "Registration failed"** - Check `manifest.json.erb` has `gcm_sender_id`
2. **VAPID endpoint 302** - Check `skip_before_action :require_authentication` on vapid_public_key
3. **Service worker clone error** - Bump `CACHE_VERSION` and clone BEFORE consuming response

### Service Worker Updates

After changing `service-worker.js`:
1. Bump `CACHE_VERSION` (e.g., v3 → v4)
2. Deploy
3. User must hard refresh (Cmd+Shift+R) or clear site data

## Key Files

| File | Purpose |
|------|---------|
| `app/jobs/transcribe_job.rb` | Groq API transcription |
| `app/jobs/push_notification_job.rb` | Send push notifications (user-scoped) |
| `app/views/pwa/service-worker.js` | Push notifications, caching |
| `app/views/pwa/manifest.json.erb` | PWA manifest |
| `app/javascript/controllers/recorder_controller.js` | Audio recording |
| `app/javascript/controllers/push_controller.js` | Push subscription UI |
| `app/controllers/push_subscriptions_controller.rb` | VAPID endpoint |
| `app/controllers/sessions_controller.rb` | Magic link auth flow |
| `app/controllers/concerns/authentication.rb` | Session management concern |
| `app/mailers/authentication_mailer.rb` | Magic link email |
| `docker-compose.production.yml` | Production deployment |

## Data Models

### Authentication (Fizzy-style)
- **Identity** - Email address holder, has_many sessions/users/magic_links
- **MagicLink** - 6-digit code, expires in 15 minutes, one-time use
- **Session** - Secure token, 90-day cookie, tracks user_agent/ip
- **User** - Name, belongs_to identity, has_many debriefs/push_subscriptions

### App Data
- **Debrief** - Audio recording with transcription, belongs_to user
- **PushSubscription** - Web push endpoint, belongs_to user (IMPORTANT: must have user_id)

## Environment

**Local:** `/Users/ivorkovic/Documents/debrief-pwa`
**Server:** `/root/debrief` on 46.224.17.255
**URL:** https://debrief.fiumed.cloud

## Database

SQLite with Solid Queue. Database file at `storage/production.sqlite3` (inside Docker volume).

```bash
# Check debriefs
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker exec debrief-debrief-1 bin/rails runner 'puts Debrief.count'"

# Check push subscriptions
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker exec debrief-debrief-1 bin/rails runner 'puts PushSubscription.count'"
```

## Testing Changes

1. Make changes locally
2. Run `bin/rails server` to test
3. Commit, push, deploy
4. Check logs for errors
5. Hard refresh browser to get new service worker

## Environment Variables (Server)

Located at `/root/debrief/.env` on server:
- `VAPID_PUBLIC_KEY` - Web push public key
- `VAPID_PRIVATE_KEY` - Web push private key
- `RAILS_MASTER_KEY` - Rails credentials key
- `GMAIL_APP_PASSWORD` - Google Workspace app password for SMTP

## Do NOT

- Touch the Flow server (188.245.246.244)
- Commit VAPID private keys or Gmail app password
- Use Kamal (this app uses docker-compose)
- Forget to bump CACHE_VERSION when changing service worker
- Send push notifications without user_id on subscription (will silently fail)
