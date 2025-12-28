# Debrief PWA - Troubleshooting Guide

This document covers common issues encountered during development and their solutions.

## Browser Compatibility

### Chrome

**Status: Fully Supported**

Chrome works well with the following requirements:
- `gcm_sender_id: "103953800507"` must be in `manifest.json.erb` for push notifications
- Service worker must be registered from the main page

**If push fails in Chrome:**
1. Clear site data: DevTools → Application → Storage → Clear site data
2. Hard refresh (Cmd+Shift+R)
3. Re-enable notifications

### Brave

**Status: Fully Supported (with fix)**

**Issue:** Service worker cache errors with `chrome-extension://` URLs.

**Error message:**
```
Failed to execute 'put' on 'Cache': Request scheme 'chrome-extension' is unsupported
```

**Root cause:** Brave browser extensions intercept requests, and when the service worker tries to cache these extension URLs, it fails.

**Fix (applied in v4):** Filter out non-HTTP(S) protocols in the fetch handler:

```javascript
// Only handle HTTP(S) requests - skip chrome-extension://, etc
const url = new URL(event.request.url);
if (!url.protocol.startsWith('http')) return;
```

**Location:** `app/views/pwa/service-worker.js:41-43`

### Safari (macOS)

**Status: Fully Supported**

Safari on macOS supports Web Push notifications. No special configuration needed.

### iOS Safari

**Status: Supported with Caveats**

**Requirements:**
- iOS 16.4 or later
- PWA must be installed to home screen (standalone mode)
- Cannot test push in browser - must install as PWA first

**Common issues:**
1. **Blank screen on offline:** Fixed with offline fallback page in service worker
2. **Permission hangs:** 10-second timeout implemented in push controller
3. **Subscription lost:** May need to re-enable after force-closing app

## Service Worker Issues

### Service Worker Not Updating

**Symptoms:** Old code running despite deploying new version

**Solution:**
1. Bump `CACHE_VERSION` in `service-worker.js` (e.g., v3 → v4)
2. Deploy changes
3. Users must hard refresh or clear site data

### Response.clone() Error

**Error:** `TypeError: Failed to execute 'clone' on 'Response': Response body is already consumed`

**Solution:** Clone the response BEFORE using it:
```javascript
// WRONG
return response;
caches.put(event.request, response.clone()); // Too late!

// CORRECT
const responseClone = response.clone();
caches.put(event.request, responseClone);
return response;
```

## Push Notification Issues

### "Getting SW..." Hangs

**Cause:** Service worker not registered

**Solution:** Ensure registration script is in `application.html.erb`:
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err));
  }
</script>
```

### "Registration failed" Error

**Possible causes:**
1. Missing `gcm_sender_id` in manifest (Chrome)
2. VAPID keys not configured
3. HTTPS not working properly

**Debug steps:**
```bash
# Check VAPID keys on server
ssh root@46.224.17.255 'cat /root/debrief/.env'

# Check subscription count
ssh root@46.224.17.255 'docker exec debrief-debrief-1 bin/rails runner "puts PushSubscription.count"'
```

## Transcription Issues

### Encoding Error with Croatian Characters

**Error:** `Encoding::UndefinedConversionError: "\xC4" from ASCII-8BIT to UTF-8`

**Cause:** Groq API returns text in ASCII-8BIT encoding

**Solution:** Force UTF-8 encoding in `transcribe_job.rb`:
```ruby
response.body.force_encoding("UTF-8").encode("UTF-8", invalid: :replace, undef: :replace).strip
```

## Deployment Issues

### Container Not Starting

**Debug steps:**
```bash
# Check container status
ssh root@46.224.17.255 "docker ps -a | grep debrief"

# Check logs
ssh root@46.224.17.255 "docker logs debrief-debrief-1 --tail=100"
```

### SSH Tunnel Not Working

**Check tunnel status:**
```bash
# On Mac
launchctl list | grep debrief-tunnel

# Test from server
ssh root@46.224.17.255 "netstat -tlnp | grep 9999"
```

## Testing

### Running Tests Locally

```bash
# Setup test database
bin/rails db:create RAILS_ENV=test
bin/rails db:migrate RAILS_ENV=test

# Run all tests
ruby -Itest -e "Dir.glob('test/**/*_test.rb').each { |f| require_relative f }"
```

### Test Coverage

Current tests cover:
- Push subscription endpoints
- Session authentication
- Health check
- Service worker content validation
- Manifest content validation

## Server Details

| Server | IP | Purpose |
|--------|-----|---------|
| **Debrief** | 46.224.17.255 | Production |
| Flow (DO NOT TOUCH) | 188.245.246.244 | Different app |

**NEVER confuse these servers. Debrief is at 46.224.17.255.**
