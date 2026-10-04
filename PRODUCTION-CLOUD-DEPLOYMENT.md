# Growther production cloud deployment

This guide prepares the existing opt-in Supabase backup and AI meal-scanner features for a production release. It does not deploy the site or move anyone's local data. The app currently stores its working copy in this browser and sends a snapshot only when a signed-in user chooses **Upload this device**. Restore replaces the current browser's allowlisted Growther data after a confirmation. The meal scanner sends a compressed photo directly to its authenticated Edge Function only after explicit photo-sharing consent; Growther does not persist that photo.

## Production gates

- Use a separate Supabase project for production. The existing `supabase-config.js` points at the development/demo project; do not treat it as the production database.
- The current cloud pilot accepts adults only. The backend requires an age band of `18–24` or `25+`; the app's age band is self-reported, not verified. Do not enable cloud accounts for minors until age-appropriate consent, deletion, privacy, and regional requirements are designed and reviewed.
- Cloud backup currently has no user-facing account deletion action or support process. Define and implement account/data deletion before inviting public production users.
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
6. Run Supabase Security Advisor and inspect every table/storage policy. Confirm RLS is on and the `account_backups` policy is owner-only. Test with two separate accounts that neither can read, overwrite, nor delete the other's backup; test signed-out access is denied.
7. Choose a paid production plan and recovery plan. Configure database backups/PITR to the required recovery objectives and separately plan backups for Storage objects if photos are added later. Database backups do not cover Storage objects.
8. Set Edge Function Secrets for `OPENROUTER_API_KEY`, a vision-and-structured-output-capable `OPENROUTER_MODEL`, and `GROWTHER_ALLOWED_ORIGINS` containing the exact HTTPS app origin. The Edge Function uses Supabase-provided `SUPABASE_URL` and `SUPABASE_ANON_KEY`; never put the OpenRouter secret in the static site.
9. Deploy the authenticated function from the project root with `supabase functions deploy scan-meal --project-ref <production-project-ref>` and confirm JWT verification stays enabled. The function allows 10 scan attempts per account per UTC day.

## Build the static site for production

From PowerShell, set the two **production project's public values** for this session and prepare a new output folder. Do not paste any secret key into this process or the app.

```powershell
$env:GROWTHER_PROD_SUPABASE_URL = 'https://your-production-project.supabase.co'
$env:GROWTHER_PROD_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...'
./Prepare-Production.ps1 -OutputDirectory 'dist-production'
```

The script copies the current `site-package` static app and creates its `supabase-config.js`. It refuses to overwrite an existing output directory. Deploy the generated folder to the chosen HTTPS host, then add that exact domain to Supabase Auth URL configuration. Keep `dist-production` out of source control because it contains the public production project identifiers, and keep any secret credentials out of it entirely.

## Release verification

Before inviting users, use dedicated test accounts and verify:

1. Signup, email confirmation, sign-in, sign-out, and recovery emails work on the production domain.
2. A non-adult profile is blocked before any profile or backup data can be written.
3. Manual upload creates only that account's `account_backups` row; sign-out and a second account cannot access it.
4. Restore only replaces the intended local browser data after the confirmation prompt. Test it with disposable data first.
5. An unavailable network leaves the local app usable and shows a clear cloud error. No automatic upload occurs.
6. Production site uses HTTPS, the correct production Supabase URL/key, and the expected service-worker cache version.
7. Account deletion and support processes are ready before collecting public-user data.
8. A signed-in adult can scan a meal, review global cuisine/dish estimates, edit or remove detected items, and save the edited result to the existing local food log. A signed-out user is blocked.

Do not use real personal records during smoke testing. The Supabase dashboard/project, production domain, SMTP credentials, and deployment target must be controlled by the app owner; this preparation intentionally does not sign up users, apply migrations, or publish the site.
