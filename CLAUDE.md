# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GitHub Action (CommonJS, Node 24, no TypeScript) that logs into 1min.ai daily, triggers the check-in reward, and optionally reports the result to Telegram. There is no framework and no test runner; everything is plain Node scripts.

## Commands

```bash
npm run unit-test   # offline unit tests via node:test (src/unit-test.js)
node --test --test-name-pattern="retries" src/unit-test.js   # run matching tests only
npm run lint        # biome check src/
npm run lint:fix    # biome check --write src/
npm run build       # ncc bundles src/index.js -> dist/index.js (dist/ is gitignored)
npm run ci          # biome ci + unit-test + build, same as the workflows
npm test            # LIVE run against 1min.ai (alias of npm start); needs EMAIL/PASSWORD env
```

Important: `npm test` is not the unit suite. It hits the real API with your credentials. Use `npm run unit-test` for offline checks.

Local live run: export `EMAIL`, `PASSWORD`, optionally `TOTP_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, then `npm start`.

## Architecture

**Entry and inputs.** `src/index.js` exports the `OneMinAutoCheckin` class and self-runs when executed directly. Every input is read as `core.getInput("x") || process.env.X`, so the same code works as an Action (`action.yml` inputs) and as a local script. The constructor never throws; `run()` validates credentials so that a misconfiguration still produces a Telegram failure notification. `run()` returns a boolean and the entry point sets `process.exitCode`, rather than calling `process.exit`. The constructor accepts `{ pollIntervalMs, pollAttempts, retryDelayMs }` so tests can skip waits.

**Check-in flow** (all in `index.js`, each step chained from the previous):
1. `login()` POSTs `/auth/login`. If `user.mfaRequired`, `performMFAVerification()` generates a TOTP code with `otpauth` and POSTs `/auth/mfa/verify` with the temporary token.
2. `displayCreditInfo()` picks the team whose `subscription.userId` matches the user's uuid (falls back to the first team), then calls `fetchLatestCredit()`.
3. `fetchLatestCredit()` is where the actual "check-in" happens: the 1min.ai reward is credited as a side effect of hitting `GET /notifications/unread` with an auth token. The reward lands ~3s after that request, too late for a balance diff, so `pollDailyTopup()` polls the credit history (`GET /teams/{id}/topups`) every 5s for up to 6 attempts and looks for a `DAILY_FREE_CREDIT` entry created after the run started (`this.startedAt`). Found: `creditDiff` is that entry's credit. Not found: `creditDiff` is 0 and `lastClaimAt` is the newest daily entry's time, i.e. it was already claimed earlier.
4. `run()` wraps everything, sets Action outputs `success`/`message`, calls `notify()` with the outcome, and `process.exit(1)` on failure.

`getCredits()` and `getTopups()` return `null` (never 0 or `[]`) when the API can't be read. If the history can't be read the reward is `creditDiff: null` ("unknown"). Keep that distinction: 0 means "already claimed", null means "couldn't read".

All HTTP goes through `fetchWithTimeout()` (10s abort), and everything except TOTP verify goes through `fetchWithRetry()` (3 attempts on network error, timeout, 429, 5xx). TOTP verify is deliberately not retried because the code may be expired or consumed. Requests use headers from `buildHeaders()`, which spoofs the web app (Origin/Referer/User-Agent) and sends a random `Mp-Identity` device id generated per run. Changing these headers can break login.

**Notifications.** `src/notifier.js` is independent of the check-in logic. `notify(outcome)` silently skips when Telegram secrets are absent, and never throws (failures become `core.warning`). Messages use Telegram `parse_mode: "HTML"`; any dynamic text (user names, API error messages) must go through `escapeHtml`, or Telegram rejects the whole message.

**Helpers and tests.** Pure functions live in `src/helpers.js`, including `validateOptionalSecret`, which treats blank strings and the literal `"null"` as unset secrets. `src/unit-test.js` imports the real modules and stubs `globalThis.fetch` with a URL-routing mock to test the HTTP flow offline. Tests reset `process.exitCode` because `core.setFailed` sets it.

## Build and release

`dist/` is gitignored. `ci.yml` runs `npm run ci` on push to main and on PRs. `daily-checkin.yml` only installs, builds, and runs `node dist/index.js`, so lint or test failures never block a day's check-in. `release.yml` runs on a `v*` tag push: lint, tests, build, then commits `dist/` onto a detached release commit and force-moves both the version tag and the floating major tag (e.g. `v1`) onto it, so `uses: 7a6163/1min-checkin@v1` gets a built `dist/index.js`. `main` never contains `dist/`. Bump `package.json` with `npm version <x.y.z> --no-git-tag-version` before tagging.

## Style

Biome enforces tabs, double quotes, and organized imports (`biome.json`). CI runs `biome ci`, which fails on formatting drift, so run `npm run lint:fix` before committing.
