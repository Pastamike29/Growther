# Growther production cloud deployment

This guide prepares the existing opt-in Supabase backup, AI meal-scanner, and support-email features for a production release. It does not deploy the site or move anyone's local data. The app stores its working copy in this browser. Google sign-in creates an auth identity and a minimal cloud profile (account ID and adult age band) for cloud feature access; it does not enable backup. The user must separately choose **Turn on automatic backup** before the app uploads profile, progress, and logs into one private account snapshot. Restore replaces the current browser's allowlisted Growther data after a confirmation. The meal scanner sends a compressed photo directly to its authenticated Edge Function only after explicit photo-sharing consent; Growther does not persist that photo. Support, feedback, and bug reports send the user's name, reply email, and note to the configured support inbox only after the user checks the email consent box.

## Production gates

- Use a separate Supabase project for production. The existing `supabase-config.js` points at the development/demo project; do not treat it as the production database.
- The intended first release includes ages 10–17 in Thailand and the USA. The current cloud pilot still accepts adults only: the backend requires an age band of `18–24` or `25+`, and the app signs out an existing cloud session if the local profile becomes under 18. This age band is self-reported, not verified. Do not open cloud accounts, photo analysis, or account-linked email feedback to minors until a reviewed guardian-consent flow, child privacy notice, parent access/deletion process, and regional safeguards are implemented.
- The account deletion UI and Edge Function are prepared in source. Until the function is deployed and tested, Settings offers an email request to support. After disposable-account verification, set `window.GA_ACCOUNT_DELETION_ENABLED = true` in the production runtime config to show the self-service deletion dialog. Do not delete an owner's live account to smoke test.
- Select the hosting provider, production HTTPS domain, and Supabase region based on the first users and applicable data-residency requirements.
- Add the final privacy notice, support contact, retention period, incident contact, and production terms before collection of real user data.

## Prepare a production Supabase project

1. Create a new Supabase project owned by the production organization. Enable MFA for dashboard owners and choose the region before adding user data.
2. In **Authentication → URL Configuration**, set the Site URL to the final HTTPS origin. Add only the real sign-in/confirmation redirect URLs needed by the deployed app. Keep local and preview domains out of the production allowlist unless they are intentionally used.
3. Configure a verified custom SMTP provider for confirmation and recovery mail. Set suitable email rate limits and CAPTCHA/bot protection before public sign-up.
4. In **Settings → API Keys**, obtain the project's URL and `sb_publishable_...` key. The publishable key is expected in the client; never use an `sb_secret_...`, service-role, database password, or SMTP credential in the static site.
5. Apply the migrations in order to the new project:
   - `supabase/migrations/202609290001_growth_arc_backend.sql`
   - `supabase/migrations/202609300001_account_backups.sql`
   - `supabase/migrations/202610040001_meal_scan_quota.sql`
   - `supabase/migrations/202610060001_seven_daily_ai_requests.sql`
   - `supabase/migrations/202610100001_google_play_purchase_claims.sql`
6. Run Supabase Security Advisor and inspect every table/storage policy. Confirm RLS is on and the `account_backups` policy is owner-only. Test with two separate accounts that neither can read, overwrite, nor delete the other's backup; test signed-out access is denied.
7. Choose a paid production plan and recovery plan. Configure database backups/PITR to the required recovery objectives and separately plan backups for Storage objects if photos are added later. Database backups do not cover Storage objects.
8. Set Edge Function Secrets for `OPENROUTER_API_KEY`, a vision-and-structured-output-capable `OPENROUTER_MODEL`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GROWTHER_ALLOWED_ORIGINS` containing the exact HTTPS and Android `https://localhost` origins, and email sending values described below. The Edge Functions use Supabase-provided `SUPABASE_URL` and `SUPABASE_ANON_KEY`; never put provider secrets in the static site.
9. Deploy `verify-play-subscription` and `scan-meal` with `supabase functions deploy verify-play-subscription --project-ref <production-project-ref>` and `supabase functions deploy scan-meal --project-ref <production-project-ref>`. Keep JWT verification enabled. AI requests require a current paid Play subscription, and each account has a shared seven-request daily limit for photo scans and typed meal estimates.
10. Configure support email. Verify a sending domain with Resend and choose a sender on that domain; the support inbox may be a separate address. Store `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GROWTHER_SUPPORT_EMAIL`, and the production origin in Supabase Edge Function Secrets. For example, run `supabase secrets set --project-ref <production-project-ref> RESEND_API_KEY=<resend-secret> RESEND_FROM_EMAIL='Growther Support <support@your-verified-domain>' GROWTHER_SUPPORT_EMAIL=<support-inbox> GROWTHER_ALLOWED_ORIGINS=https://your-app.example`. Replace each placeholder with the real value; keep the API key and support inbox in Supabase secrets, not the static site or source control. The function rejects unapproved origins, limits message size, requires explicit consent, and applies best-effort per-IP and per-email rate limits. It does not save messages in the app database.
11. Deploy the support function with `supabase functions deploy send-support-message --project-ref <production-project-ref>`. This endpoint has JWT verification disabled so local-only users can contact support; its own origin allowlist and validation are required safeguards. Configure the function secrets before turning on the form. Send sample messages from a disposable mailbox before public launch.
12. Deploy `delete-account` with `supabase functions deploy delete-account --project-ref <production-project-ref>`. Keep JWT verification enabled. The function checks the user token, deletes that user's private `meal-photos` objects, then uses a server-only service-role key to delete the auth user; the database foreign keys cascade the remaining user rows. Verify the function has the Supabase-provided `SUPABASE_SERVICE_ROLE_KEY` and `GROWTHER_ALLOWED_ORIGINS` secret. Never put the service-role key in the static site. Use a disposable account with a backup and photo to verify deletion and confirm a second account is unaffected. Only then turn on `GA_ACCOUNT_DELETION_ENABLED` for that deployment.

## Build the static site for production

From PowerShell, set the two **production project's public values** for this session and prepare a new output folder. Do not paste any secret key into this process or the app.

```powershell
$env:GROWTHER_PROD_SUPABASE_URL = 'https://your-production-project.supabase.co'
$env:GROWTHER_PROD_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...'
$env:GROWTHER_PRIVACY_URL = 'https://your-public-growther-site.example/privacy.html'
./Prepare-Production.ps1 -OutputDirectory 'dist-production'
```

The standalone privacy website source is in `C:\Users\NITRO\Documents\Codex\Growther-Privacy-Web`; publish that folder separately and replace the example privacy URL with its real public HTTPS URL. The production preparation script copies the current `site-package` static app and creates its `supabase-config.js`, including the privacy URL. It refuses to overwrite an existing output directory. Deploy the generated folder to the chosen HTTPS host, then add that exact domain to Supabase Auth URL configuration. Keep `dist-production` out of source control because it contains the public production project identifiers, and keep any secret credentials out of it entirely.

## Release verification

Before inviting users, use dedicated test accounts and verify:

1. Signup, email confirmation, sign-in, sign-out, and recovery emails work on the production domain.
2. A non-adult profile is blocked before any profile or backup data can be written.
3. Manual upload creates only that account's `account_backups` row; sign-out and a second account cannot access it.
4. Restore only replaces the intended local browser data after the confirmation prompt. Test it with disposable data first.
5. An unavailable network leaves the local app usable and shows a clear cloud error. No automatic upload occurs.
6. Production site uses HTTPS, the correct production Supabase URL/key, and the expected service-worker cache version.
7. Account deletion removes a disposable account's auth identity, backup, logs, quota record, and any stored photos. Its browser data clears only after a successful server response. Verify failed deletion leaves browser records available for export. Verify support delivery separately.
8. A signed-in adult can scan a meal, review global cuisine/dish estimates, edit or remove detected items, and save the edited result to the existing local food log. A signed-out user is blocked.
9. Each support form requires a name, valid reply email, message, and separate email consent; the configured inbox receives it, with the sender set as Reply-To. The Storage view reports local app data and browser origin usage; export downloads app-owned local keys, and clear removes app-owned local data while preserving unrelated origin data and separate cloud backups.

Do not use real personal records during smoke testing. The Supabase dashboard/project, production domain, SMTP credentials, and deployment target must be controlled by the app owner; this preparation intentionally does not sign up users, apply migrations, or publish the site.
