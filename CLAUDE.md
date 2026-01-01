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

### Croatian characters crashing listener

**Error:** `invalid byte sequence in US-ASCII` in `/tmp/debrief-listener.log`

**Fix:** Ensure `/Users/ivorkovic/scripts/debrief-listener.rb` has:
```ruby
Encoding.default_external = Encoding::UTF_8
Encoding.default_internal = Encoding::UTF_8
```

Then restart: `launchctl stop com.ivorkovic.debrief-listener && launchctl start com.ivorkovic.debrief-listener`

### iOS PWA App Icon Not Updating

**Critical:** iOS Safari **ignores** `manifest.json` icons completely. It only reads from `<link rel="apple-touch-icon">` in HTML head.

**Requirements:**
- File: `public/apple-touch-icon.png` (180x180px)
- Link tag: `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=X">`
- Format: Square PNG, no rounded corners (iOS applies its own mask)
- Cache busting: Increment `?v=X` query param when updating icon

**To update icon:**
1. Replace `public/apple-touch-icon.png` (180x180)
2. Increment version in `application.html.erb`: `?v=2` → `?v=3`
3. Deploy
4. User must: Delete app → Close Safari → Reopen → Visit site → Add to Home Screen

### iOS Safari: NEVER use Permissions API for microphone

**Critical:** `navigator.permissions.query({ name: "microphone" })` is **NOT supported on iOS Safari** and will break audio recording silently - files upload as empty!

**Symptoms:**
- Recording appears to work (timer runs)
- Upload succeeds
- Groq returns: `"file is empty"` error
- Audio player shows 00:00 duration

**Root cause:** iOS Safari doesn't support Permissions API for microphone. Any code that uses it before `getUserMedia()` will fail silently or throw, potentially breaking the recording flow.

**Solution:** Never use Permissions API on iOS. Just call `getUserMedia()` directly - iOS will prompt if needed.

### iOS Safari: Microphone permission asked repeatedly

**Problem:** iOS asks for microphone permission every other recording session.

**Root cause:** Incomplete stream cleanup confuses iOS permission state tracking.

**Fix (in `recorder_controller.js`):**
1. Stop stream tracks IMMEDIATELY when recording stops (not deferred to callbacks)
2. Set `onstop` callback once in `start()`, don't re-bind in `stop()`
3. Use flag to prevent double-processing of onstop

```javascript
// In finalizeRecording() - stop stream FIRST
if (this.stream) {
  this.stream.getTracks().forEach(track => track.stop())
  this.stream = null
}
// Then create blob
this.audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType })
```

### Upload hardening

The recorder has built-in resilience:
- **60-second timeout** - Prevents indefinite hangs on slow connections
- **3 retry attempts** - Exponential backoff (2s, 4s, 8s)
- **50MB file size limit** - Enough for ~90 min of voice audio
- **Network check** - Validates `navigator.onLine` before upload

Config in `recorder_controller.js`:
```javascript
static MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
static UPLOAD_TIMEOUT = 60000 // 60 seconds
static MAX_RETRIES = 3
```

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
- **Debrief** - Audio or text entry with transcription, belongs_to user
  - `entry_type` enum: `audio` (default) or `text`
  - Audio entries: uploaded, transcribed via Groq, then notify
  - Text entries: skip transcription, notify immediately
  - `has_many_attached :attachments` - images, PDFs, docs attached to text entries
- **PushSubscription** - Web push endpoint, belongs_to user (IMPORTANT: must have user_id)

## File Attachments (Write Mode)

Users can attach files when sending text messages:

**Supported formats:** Images, PDFs, text files, docs, spreadsheets

**How it works:**
1. User taps "Attach files" in Write mode
2. iOS opens photo library/Files app
3. Selected files appear in preview with remove button
4. On send, files are uploaded via Active Storage
5. Notification includes attachment URLs
6. Mac listener downloads to `/tmp/debrief_attachments/{id}/`
7. Attachment paths included in debrief markdown for Claude

**Key files:**
- `recorder_controller.js` - file picker, preview, FormData upload
- `debriefs_controller.rb` - handles `attachments[]` param
- `notify_job.rb` - builds attachment URLs
- `debrief-listener.rb` - downloads attachments before notifying Claude

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
