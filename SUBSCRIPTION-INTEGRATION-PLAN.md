# Growther subscription integration

## Current direction

The Android app uses Capacitor and the native Google Play Billing client. The Android package ID is `com.wongwaiyut.growther`. Supabase verifies Google Play purchase tokens directly using a server-only Google service account credential. The app does not send a Supabase user ID to RevenueCat or another subscription intermediary.

The monthly Play product ID is `growther_premium_monthly` with base plan ID `monthly`. The annual product ID is `growther_premium_annual` with base plan ID `annual`. Actual localized prices must be configured in Play Console; the artwork's `$24.90/year` and `฿80/week` are preview targets.

## Access rules

- AI photo scans and typed meal estimates require a signed-in adult, an active subscription verified with Google Play by the Supabase backend, and available daily quota.
- Free users cannot call the AI endpoint, even if they alter browser state or invoke the endpoint directly.
- Purchase tokens are checked against Play on each AI request, and the backend stores only a SHA-256 token hash to prevent a purchase being linked to multiple Growther accounts.
- Cloud account and non-AI features retain their existing access rules.
- Youth purchases remain unavailable until guardian-consent and parent-payment rules are implemented for launch markets.

## Setup still required

Create and activate both subscription base plans in Play Console; enable the Google Play Android Developer API; authorize a service account; store its JSON credential as the Supabase Edge Function secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`; allow the Android WebView origin `https://localhost`; apply the database migration; deploy `verify-play-subscription` and `scan-meal`; then build and test a signed Android App Bundle through the Play internal testing track. See [ANDROID-PLAY-BILLING-SETUP.md](ANDROID-PLAY-BILLING-SETUP.md) for the step-by-step checklist.

The existing machine lacks Android Studio/SDK and Java 21, so it cannot yet produce the signed `.aab`. Apple distribution is a separate follow-up that requires StoreKit, App Store Connect subscription products, and a Mac with Xcode.
