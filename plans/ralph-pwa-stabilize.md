# Ralph Task: Debrief PWA Complete Stabilization

## Task
Make the Debrief PWA completely stable across all browsers and devices. Fix push notifications, service worker issues, and iOS fragility. No new features - only stabilization of existing functionality.

**Working Directory:** /Users/ivorkovic/Documents/debrief-pwa

---

## PHASE 0: SETUP
1. Read CLAUDE.md and docs/ARCHITECTURE.md for context
2. Check current state of the app with dev-browser
3. Note all console errors and issues found

---

## PHASE 1: BROWSER TESTING & ISSUE IDENTIFICATION

Use dev-browser to test https://debrief.fiumed.cloud on each scenario:

### Test Sequence (for each browser):
1. Navigate to https://debrief.fiumed.cloud
2. Check console for errors
3. Check if service worker registered (console should show "SW registered")
4. Click notification toggle and check for errors
5. Document all issues found

### Browsers to Test:
- Chrome (Mac)
- Brave (Mac) - Known issue: push fails
- Safari (Mac)

### Record Issues:
Create a checklist of all issues found. Use TodoWrite to track them.

---

## PHASE 2: FIX ISSUES

For each issue found:

1. **Identify root cause** - Read relevant code, check console errors
2. **Implement fix** - Edit the appropriate file
3. **Bump service worker version** if touching service-worker.js
4. **Commit the fix**:
   ```bash
   git add -A && git commit -m "fix: [description]"
   ```

### Key Files to Check:
- `app/views/pwa/service-worker.js` - Cache, clone bugs, push handler
- `app/views/pwa/manifest.json.erb` - gcm_sender_id (already has it)
- `app/javascript/controllers/push_controller.js` - Subscription flow
- `app/controllers/push_subscriptions_controller.rb` - VAPID endpoint

### Common Fixes:
- **Brave push fails**: May need different push API approach or feature detection
- **Service worker errors**: Clone response before consuming, proper cache versioning
- **iOS blank screen**: Offline page fallback, proper cache strategy

---

## PHASE 3: DEPLOY & VERIFY

After each fix batch:

```bash
# Push to GitHub
git push origin main

# Deploy to Hetzner (46.224.17.255 - NEVER 188.245.246.244!)
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "cd /root/debrief && git pull && docker compose -f docker-compose.production.yml up -d --build"

# Wait for deploy
sleep 30

# Verify container running
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker ps | grep debrief"

# Check logs for errors
ssh -i ~/.ssh/id_rsa_hetzner root@46.224.17.255 "docker logs debrief-debrief-1 --tail=50"
```

Then re-test with dev-browser to verify fix worked.

---

## PHASE 4: LOOP UNTIL FIXED

Repeat PHASE 1-3 until ALL browsers show:
- [ ] No console errors
- [ ] Service worker registers successfully
- [ ] Push notification subscription works (or gracefully fails with clear message if browser doesn't support)

---

## PHASE 5: CREATE TEST SUITE

Create automated tests for the critical paths:

1. **System tests for API endpoints:**
   - VAPID public key endpoint returns valid key
   - Push subscription create/delete works
   - Debrief CRUD operations

2. **JavaScript tests (if framework allows):**
   - Service worker registration
   - Push controller flow

Save tests in `test/` directory following Rails conventions.

Run tests:
```bash
bin/rails test
```

---

## PHASE 6: UPDATE DOCUMENTATION

### Local Docs:
1. Update `docs/ARCHITECTURE.md` with any new learnings
2. Create `docs/TROUBLESHOOTING.md` with all issues found and their fixes
3. Update `README.md` if needed

### Writebook:
Use the writebook skill to update Claude Workstation Docs (book ID: 2):

```bash
/writebook
```

Create or update a page about Debrief PWA covering:
- What the app does
- Deployment instructions
- Common issues and fixes
- Browser compatibility notes

---

## PHASE 7: FINAL VERIFICATION

1. Run full test suite
2. Test with dev-browser on all browsers one more time
3. Verify server is running
4. Verify all documentation is current

---

## SUCCESS CRITERIA (ALL must be verified)

- [ ] Chrome: No console errors, push works
- [ ] Brave: No console errors, push works OR graceful fallback
- [ ] Safari: No console errors, push works
- [ ] Service worker registers on all browsers
- [ ] No Response.clone() errors
- [ ] Server deployed and running
- [ ] `bin/rails test` passes
- [ ] docs/ARCHITECTURE.md updated
- [ ] docs/TROUBLESHOOTING.md created
- [ ] Writebook page updated
- [ ] All code committed and pushed

---

## CRITICAL EXECUTION RULES

1. **USE DEV-BROWSER** - Test the actual production app, not assumptions
2. **DEPLOY AFTER EACH FIX BATCH** - Don't accumulate too many changes
3. **VERIFY AFTER DEPLOY** - Re-test with dev-browser
4. **DON'T STOP EARLY** - Keep looping until ALL success criteria verified
5. **NEVER TOUCH 188.245.246.244** - That's the Flow server, not Debrief

---

## COMPLETION

Output `<promise>COMPLETE</promise>` only when ALL success criteria are verified and you have confirmed:
1. All browsers tested and working
2. All tests pass
3. Server running
4. Documentation complete
