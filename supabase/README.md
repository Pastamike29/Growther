# Growth Arc backend setup (Supabase)

This folder contains the cloud-backend foundation for the prototype. The first migration creates private per-user profile, sleep, nutrition, exercise, rest-day, and saved-meal records plus a private bucket for optional meal photos. The second adds the private account-backup row used by the current prototype's opt-in sync buttons.

## Important before launch

- This is a prototype migration, not a complete production privacy/compliance review.
- The current prototype audience includes minors. This cloud pilot deliberately accepts only the `18–24` and `25+` age bands; log and photo policies also require that adult profile to exist. This is a self-reported age gate, not identity or age verification. Do not collect or upload anyone under 18 until you have implemented appropriate guardian consent, privacy controls, deletion flows, and the requirements for every country where you launch.
- Meal images can reveal sensitive information. Upload them only after a clear user action and explain retention/deletion. The bucket is private and limited to 10 MB JPEG/PNG/WebP files.
- Community posts are intentionally not in this first migration. A public feed needs moderation, reporting/blocking, abuse handling, and age-appropriate safety before cloud launch.
- Nutrition values are estimates. Do not present them as clinical advice or verified measurements.
- Never put a Supabase secret key/service-role key in `index.html`, a browser, a mobile build, Git, or chat. The browser receives only the project's publishable key; row-level security protects data.

## Create the development project

1. Create a Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard). Choose a region suitable for your initial testers and use a strong, unique database password.
2. Open **SQL Editor → New query**, paste and run `migrations/202609290001_growth_arc_backend.sql` once.
3. In a new SQL Editor query, paste and run `migrations/202609300001_account_backups.sql` once.
4. In **Authentication → URL Configuration**, set the Site URL to your local server origin for development and add that exact origin to the redirect URL allowlist (for example `http://127.0.0.1:5500/**`). Add the deployed HTTPS origin before sharing online. Keep email confirmation enabled and sign in after confirming.
5. In **Storage**, confirm the `meal-photos` bucket is private and the policies from the migration exist.
6. The supplied project URL and publishable key are in `../supabase-config.js`. A publishable key is designed for public clients; never use the secret key in browser code.
7. Create two test users and verify that each user can only read, change, and delete their own rows and files. Also verify signed-out users cannot access private tables or the photo bucket.
8. Export a database backup before production changes. Supabase's free plan currently pauses projects after one week without activity and does not include automatic backups, so it is for development/demo use.

## Current connection status

The app now uses Google OAuth through Supabase Auth and offers opt-in automatic backup from Profile → Cloud Backup. The app has no email/password account creation or sign-in controls. Backup starts only after the user enables it; allowlisted Growther app data then syncs to the signed-in user's private `account_backups` row after changes. Meal photos and Supabase auth tokens are excluded. The page must be served from `http://localhost` or HTTPS; browser cloud requests do not work from a `file://` page. The browser CDN SDK is loaded from jsDelivr, so internet access is required.

### Configure Google sign-in

The meal scanner's **Continue with Google** action uses Supabase Auth OAuth; it does not request Google Drive or other Google API access.

1. In Google Cloud Console, create or select a project, configure the OAuth consent screen, and create an OAuth client with application type **Web application**.
2. Add your app origins under **Authorized JavaScript origins** (for local development, `http://localhost:8000`; add the deployed HTTPS origin too).
3. Add this Supabase callback under **Authorized redirect URIs**: `https://fxehpiociylntzmizrkf.supabase.co/auth/v1/callback`.
4. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and paste the Google OAuth client ID and client secret. Save the provider settings. Keep the secret in Supabase only; never place it in browser code or Git.
   If you want Google to be the only sign-in method at the Supabase project level, disable the Email provider there too.
5. In Supabase **Authentication → URL Configuration**, add the app callback destinations to **Redirect URLs**: `http://localhost:8000/**` for local development and `https://YOUR-PRODUCTION-DOMAIN/**` for production. Set the Site URL to the deployed app origin before launch.
6. Serve the app from `http://localhost:8000` and tap **Continue with Google**. Google redirects to Supabase first, then Supabase returns to the app. The app restores the sign-in session and checks the existing adult-profile requirement.

Google OAuth can remain in testing mode while developing; add tester accounts in Google's consent-screen settings. Before public launch, complete the Google consent-screen publishing and verification requirements that Google shows for the scopes and audience you use.

## AI meal photo scanner

The scanner and typed-meal estimator use the authenticated `scan-meal` Edge Function; the browser never receives the OpenRouter key. The function requires a signed-in adult account whose `profiles.age_band` is `18–24` or `25+`, a currently active Google Play subscription verified server-side, and remaining daily quota. Photo scans send a compressed JPEG only after the user confirms the photo-sharing notice; the image is not written to Supabase Storage or local storage. The shared limit is seven AI requests per account per UTC day.

Apply `migrations/202610040001_meal_scan_quota.sql` after the two database migrations above. In Edge Function Secrets, set:

- `OPENROUTER_API_KEY`: the server-only OpenRouter key.
- `OPENROUTER_MODEL`: a vision-capable model slug that supports OpenRouter JSON Schema structured outputs.
- `GROWTHER_ALLOWED_ORIGINS`: comma-separated exact origins, such as `https://your-app.example` (add local origins only in development).
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: the private service-account JSON used only to validate and acknowledge Google Play subscriptions. Configure it for Android billing; never put it in the app.

Supabase provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the Edge Functions. Apply the migrations, then deploy both `verify-play-subscription` and `scan-meal` with JWT verification enabled. For local Edge Function development, copy `functions/.env.example` to `functions/.env`, fill local test secrets, and run the functions after applying migrations to a local Supabase stack. Never commit a populated `.env` file.

OpenRouter accepts a data URL in a chat-completion `image_url` part and supports JSON Schema structured responses on compatible models. The function validates and normalizes model output; totals are recomputed from per-food values before returning them. Initial nutrition estimates come from the vision model, not a verified nutrition-database lookup. Users can edit results before saving; only the edited food names and nutrition numbers enter the existing local food log.

## Support, feedback, and bug reports

The Settings forms ask for a name, reply email, note, and explicit email consent. The browser invokes `send-support-message`; it does not store the note locally or attach profile, meal, or exercise records. The Edge Function uses Resend with server-side secrets `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `GROWTHER_SUPPORT_EMAIL`. Verify the sender domain with Resend before configuring the sender address. Set `GROWTHER_ALLOWED_ORIGINS` to exact app origins. The endpoint validates the message and applies best-effort in-memory IP/email rate limits; before a high-volume public launch, add a durable rate-limit or challenge provider.

The settings Storage view estimates the app's local key/value data and browser-reported origin usage. Export downloads only Growther-owned local keys; Supabase auth tokens and cloud-sync control markers are excluded. Clear removes Growther local data, pauses auto backup on this device, and restarts setup; it does not delete the private cloud backup or change browser notification permission.

## Suggested first sync order

1. Verify Google sign-in, opt in to automatic backup, and confirm existing cloud/local data is reconciled as expected.
2. Replace snapshot sync with direct row-level synchronization as the app is modularized.
3. Private photo upload only after explicit user confirmation; store object paths in a later migration and add a user-controlled delete action.
4. Community only after moderation and safety design is ready.

## Table ownership rules

Every user data table has RLS enabled, explicit authenticated-only grants, and a policy requiring `auth.uid()` to match the row's owner. The private storage bucket restricts reads, uploads, and deletes to objects inside the caller's UUID folder. There is no public profile/feed policy in this migration.

## Cost

Supabase currently lists a Free plan at $0/month for experiments, with 500 MB database, 1 GB file storage, and 5 GB cached egress; inactive free projects may pause. The current Pro plan starts at $25/month, with 100 GB file storage and 250 GB egress included before usage charges. Confirm current limits and terms on [Supabase pricing](https://supabase.com/pricing) before launch.
