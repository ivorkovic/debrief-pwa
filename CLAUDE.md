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

### Deployment

```bash
# Commit and push
git add -A && git commit -m "message" && git push origin main

# Deploy to production
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "cd /root/debrief && git pull && docker compose -f docker-compose.production.yml up -d --build"
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
| `app/views/pwa/service-worker.js` | Push notifications, caching |
| `app/views/pwa/manifest.json.erb` | PWA manifest |
| `app/javascript/controllers/recorder_controller.js` | Audio recording |
| `app/javascript/controllers/push_controller.js` | Push subscription UI |
| `app/controllers/push_subscriptions_controller.rb` | VAPID endpoint |
| `docker-compose.production.yml` | Production deployment |

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

## Do NOT

- Touch the Flow server (188.245.246.244)
- Commit VAPID private keys
- Use Kamal (this app uses docker-compose)
- Forget to bump CACHE_VERSION when changing service worker
