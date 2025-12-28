# Debrief PWA - Architecture Documentation

## Overview

Debrief is a voice-to-text transcription PWA that allows recording voice memos on any device (phone, tablet, desktop) and automatically transcribes them using Groq's Whisper API. Transcripts are then pushed in real-time to the Claude Code "root" tmux session via SSH reverse tunnel. After Claude processes the request, it reports completion back to the server, which triggers a push notification to the user's device.

**Key flow:**
1. User records audio in browser (any device)
2. Audio uploaded to server, transcription job queued
3. Groq Whisper API transcribes audio
4. Server POSTs notification to Mac via SSH tunnel
5. Mac listener receives notification, sends to Claude Code
6. Claude sees "New debrief arrived (ID: X): /tmp/debrief_X.md"
7. Claude processes the request
8. Claude calls completion API: `POST /api/debriefs/:id/complete`
9. Server sends push notification to user's subscribed devices
10. User sees notification with completion summary

## Components

### 1. Rails PWA (Server - Hetzner)

**Location:** `/root/debrief` on server, `~/Documents/debrief-pwa` locally

**Stack:**
- Rails 8.1.1 with Ruby 3.4.3
- SQLite with Solid Queue for background jobs
- Tailwind CSS v4
- Hotwire (Turbo + Stimulus)
- ActiveStorage for audio file storage

**Key files:**
- `app/controllers/debriefs_controller.rb` - CRUD for debriefs
- `app/controllers/sessions_controller.rb` - Multi-user authentication
- `app/controllers/api/notifications_controller.rb` - Internal API for Mac listener + completion
- `app/controllers/push_subscriptions_controller.rb` - Web Push subscription management
- `app/jobs/transcribe_job.rb` - Groq Whisper transcription + notification
- `app/jobs/push_notification_job.rb` - Sends push notifications via Web Push API
- `app/javascript/controllers/recorder_controller.js` - MediaRecorder for browser
- `app/javascript/controllers/push_controller.js` - Push notification subscription UI
- `app/views/pwa/service-worker.js` - Service worker for push notifications

**Deployment:**
- Docker container via docker-compose.production.yml
- Caddy reverse proxy with auto-HTTPS
- URL: https://debrief.fiumed.cloud
- Port: 3004 (internal)

### 2. SSH Reverse Tunnel (Mac ↔ Server)

**Purpose:** Allows server (inside Docker) to reach Mac's port 9999

**Mac-side daemon:** `~/Library/LaunchAgents/com.ivorkovic.debrief-tunnel.plist`

```bash
autossh -M 0 -N \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -R 0.0.0.0:9999:127.0.0.1:9999 \
  root@46.224.17.255
```

**Key points:**
- Uses `0.0.0.0:9999` to bind to all interfaces (required for Docker)
- Server needs `GatewayPorts yes` in `/etc/ssh/sshd_config`
- UFW rule: `ufw allow from 172.22.0.0/16 to any port 9999`

### 3. Debrief Listener (Mac)

**Location:** `~/scripts/debrief-listener.rb`

**Daemon:** `~/Library/LaunchAgents/com.ivorkovic.debrief-listener.plist`

**Purpose:**
- Listens on port 9999 for POST /notify from server
- On notification: writes transcript to /tmp/debrief_X.md
- Sends message to Claude Code via tmux

**Tmux integration (critical - must match Fizzy pattern):**
```ruby
# Write message to temp file
File.write(msg_file, msg)

# Fizzy's exact approach - DO NOT SIMPLIFY
system("tmux", "load-buffer", msg_file)
system("tmux", "paste-buffer", "-t", "root")
sleep(0.3)
system("tmux", "send-keys", "-t", "root", "C-m")
```

**Plist requirements (must have these for tmux to work):**
```xml
<key>WorkingDirectory</key>
<string>/Users/ivorkovic</string>

<key>EnvironmentVariables</key>
<dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/ivorkovic</string>
</dict>
```

**Catchup mechanism:**
- On startup, calls GET /api/unnotified to fetch missed debriefs
- Processes each, then POSTs /api/notifications/:id/ack to mark as notified
- Ensures no debriefs are lost when Mac is offline/asleep

### 4. Notification API (Server)

**Routes:**
- `GET /api/unnotified` - Returns debriefs with status=done and notified_at=nil
- `POST /api/notifications/:id/ack` - Sets notified_at to mark as delivered
- `POST /api/debriefs/:id/complete` - Claude reports task completion (triggers push notification)

**Security:**
- Only allows requests from localhost/Docker IPs (172.x.x.x)
- CSRF protection disabled for API endpoints

### 5. Multi-User Authentication

**Users:** Ivor and Marija have separate access codes.

**Implementation:** `app/controllers/sessions_controller.rb`
```ruby
USER_CODES = {
  "17121984" => "Ivor",
  "15062016" => "Marija"
}.freeze
```

**Flow:**
- User enters PIN on login page
- Session stores `authenticated: true` and `user: "Ivor"` or `user: "Marija"`
- `recorded_by` field on Debrief model tracks who recorded each note

### 6. Push Notifications (Web Push API)

**Purpose:** Notify users when Claude completes their debrief task.

**Components:**
- `PushSubscription` model - stores endpoint, p256dh, auth keys
- `PushNotificationJob` - sends notifications using `web-push` gem
- Service worker (`service-worker.js`) - handles push events and shows notifications
- Push controller (`push_controller.js`) - manages subscription UI

**VAPID Keys:**
- Generated with `WebPush.generate_key`
- Stored in server's `.env` file (NOT in git!)
- Public key served via `/push/vapid_public_key` endpoint

**Critical: Service Worker Registration**

The service worker MUST be registered in `application.html.erb`:
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err));
  }
</script>
```

Without this, `navigator.serviceWorker.ready` hangs forever and push subscriptions fail silently.

**iOS Safari Requirements:**
- iOS 16.4+ required for Web Push support
- PWA must be installed to home screen (standalone mode)
- Push subscriptions may be cleared when app is force-closed

### 7. Task Completion Flow

**Claude's workflow (see `~/.claude/skills/debrief/SKILL.md`):**

1. Receive debrief: "New debrief arrived (ID: 123): /tmp/debrief_123.md"
2. Read and process the transcript
3. Report completion:
```bash
ssh root@46.224.17.255 'curl -s -X POST http://localhost:3004/api/debriefs/123/complete -H "Content-Type: application/json" -d "{\"summary\":\"Brief description of what was done\"}"'
```

**Server response:**
- Updates `completion_summary` and `completed_at` on debrief
- Enqueues `PushNotificationJob` to notify subscribed devices
- Returns `{"ok": true}`

## Deployment

### Initial Setup

```bash
# On Mac
cd ~/Documents/debrief-pwa
git push origin main

# On Server
cd /root/debrief
git pull
docker compose -f docker-compose.production.yml up -d --build
```

### Update Deployment

```bash
# Local
git add -A && git commit -m "message" && git push origin main

# Server
ssh root@46.224.17.255 "cd /root/debrief && git pull && docker compose -f docker-compose.production.yml up -d --build"
```

### Credentials & Environment Variables

**Rails credentials** (encrypted, in git):
```bash
EDITOR=nano rails credentials:edit
```
Contains:
- `groq.api_key`: Groq Whisper API key

**Server `.env` file** (NOT in git - on server at `/root/debrief/.env`):
```bash
VAPID_PUBLIC_KEY=BI9zjHcOupIxBK491VARYEbw7RLLFbaBG3nGWDtqJCaxDmzcLLC5w6tw8mVX75sJdKR8hb4960-l4DluiiPL15E=
VAPID_PRIVATE_KEY=<secret>
RAILS_MASTER_KEY=<from config/master.key>
```

**Generating new VAPID keys:**
```ruby
require 'web-push'
keys = WebPush.generate_key
puts "VAPID_PUBLIC_KEY=#{keys.public_key}"
puts "VAPID_PRIVATE_KEY=#{keys.private_key}"
```

**Security note:** If VAPID keys are ever committed to git, generate new ones immediately. Old keys should be considered compromised.

## Troubleshooting

### Notification not reaching Claude

1. **Check listener is running:**
   ```bash
   launchctl list | grep debrief-listener
   tail -f /tmp/debrief-listener.log
   ```

2. **Check tunnel is running:**
   ```bash
   launchctl list | grep debrief-tunnel
   ssh root@46.224.17.255 "netstat -tlnp | grep 9999"
   ```

3. **Test tunnel from server:**
   ```bash
   ssh root@46.224.17.255 "curl -s http://localhost:9999/test"
   # Should return "not found" (404 from listener)
   ```

4. **Test from inside Docker:**
   ```bash
   ssh root@46.224.17.255 "docker exec \$(docker ps -q -f name=debrief) curl -s http://host.docker.internal:9999/test"
   ```

5. **Check UFW:**
   ```bash
   ssh root@46.224.17.255 "ufw status | grep 9999"
   # Should show: 9999 ALLOW 172.22.0.0/16
   ```

### Transcription failing

1. **Check job logs:**
   ```bash
   ssh root@46.224.17.255 "cd /root/debrief && docker compose logs --tail=50 | grep TranscribeJob"
   ```

2. **Check Groq API key:**
   ```bash
   rails credentials:show
   ```

### iOS Safari issues

- Uses FormData with fetch() API (not DataTransfer)
- MediaRecorder uses audio/webm or audio/mp4 depending on browser support
- Microphone permission must be re-granted after force-closing app (iOS limitation)

### Push notifications not working

1. **Check service worker is registered:**
   - Open browser console
   - Should see "SW registered: /" on page load
   - If not, check `application.html.erb` has the registration script

2. **Check subscription exists:**
   ```bash
   ssh root@46.224.17.255 'cd /root/debrief && docker compose -f docker-compose.production.yml exec -T debrief bin/rails runner "puts PushSubscription.count"'
   ```

3. **Check VAPID keys are set:**
   ```bash
   ssh root@46.224.17.255 'cat /root/debrief/.env'
   ```

4. **iOS-specific issues:**
   - Must be installed as PWA (Add to Home Screen)
   - iOS 16.4+ required
   - May need to delete and re-add to home screen after updates
   - Subscription lost on force-close - need to re-enable

5. **Button shows "Getting SW..." and hangs:**
   - Service worker not registered - check `application.html.erb`
   - This was the main bug we fixed - the registration script was missing

## Architecture Decisions

### Why SSH tunnel instead of polling/webhooks?

- **Polling:** Wasteful, adds latency
- **External webhooks (ntfy.sh):** Third-party dependency, security concerns
- **SSH tunnel:** Secure, self-hosted, instant, reliable

### Why launchd instead of running in terminal?

- Survives reboots
- Auto-restarts on crash
- Runs without user session (mostly)

### Why Fizzy's tmux pattern?

Simple `tmux send-keys` doesn't work from launchd daemons. The load-buffer + paste-buffer + sleep + C-m pattern is the only reliable way to send text to a tmux session from a background process.

## UI/UX

### Recording Flow

The recording interface uses a Stimulus controller (`recorder_controller.js`) with three states:

1. **Idle:** Big red record button (centered)
   - Tap to start recording

2. **Recording:** Red pulsing stop button (same centered position)
   - Timer counts up
   - Tap to stop recording

3. **Preview:** Two equal-sized buttons side by side
   - Gray X (cancel) - discards recording, returns to idle
   - Green checkmark (send) - uploads and transcribes

### Auto-refresh

Both index and show pages auto-refresh every 3 seconds while any debrief has `pending` or `transcribing` status:

```erb
<% if @debrief.pending? || @debrief.transcribing? %>
  <meta http-equiv="refresh" content="3">
<% end %>
```

### Detail Page Actions

Each debrief detail page has:
- **Resend button** (blue) - Re-sends transcript notification to Claude
- **Delete button** (red) - Deletes the debrief with confirmation

### Status Badges

- `pending` - Yellow, waiting for transcription job
- `transcribing` - Blue, Groq API processing
- `done` - Green, completed
- `failed` - Red, error occurred
