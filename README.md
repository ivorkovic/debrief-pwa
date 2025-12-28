# Debrief PWA

Voice memo recorder with AI transcription. Record on any device, automatically transcribe via Groq Whisper, and push to Claude Code for processing.

## Quick Start

```bash
# Local development
bin/rails server

# Deploy to production
git push origin main
ssh root@46.224.17.255 "cd /root/debrief && git pull && docker compose -f docker-compose.production.yml up -d --build"
```

## Stack

- Rails 8.1 / Ruby 3.4
- SQLite + Solid Queue
- Tailwind CSS v4
- Hotwire (Turbo + Stimulus)
- Web Push API for notifications
- Groq Whisper API for transcription

## Production

- **URL:** https://debrief.fiumed.cloud
- **Server:** Hetzner (46.224.17.255)
- **Container:** Docker Compose
- **Port:** 3004 (internal), Caddy reverse proxy

## Key Files

| File | Purpose |
|------|---------|
| `app/jobs/transcribe_job.rb` | Groq Whisper transcription |
| `app/javascript/controllers/recorder_controller.js` | Browser MediaRecorder |
| `app/views/pwa/service-worker.js` | Push notifications (v3) |
| `app/controllers/push_subscriptions_controller.rb` | VAPID key endpoint |
| `docker-compose.production.yml` | Production deployment |

## Environment Variables (Server)

```bash
# /root/debrief/.env
RAILS_MASTER_KEY=<from config/master.key>
VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
```

## Documentation

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture, troubleshooting, and deployment instructions.
