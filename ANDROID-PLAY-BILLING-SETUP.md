# Growther Android billing and internal testing

## Current project state

- Android application ID: `com.wongwaiyut.growther`.
- The Capacitor Android project and native Google Play Billing plugin are present.
- The app requests localized prices and purchases from Google Play. Supabase verifies each purchase token directly with the Google Play Developer API; no RevenueCat customer identifier is sent to a third party.
- Both AI entry points (photo meal scan and typed meal estimate) require a signed-in adult account and a currently active Google Play subscription. The existing seven AI requests per day limit applies to subscribers. Free users can use non-AI app features.
- Product IDs expected by the app: `growther_premium_monthly` with base plan `monthly`, and `growther_premium_annual` with base plan `annual`.
- Google Play products, Google service-account access, Supabase secrets/deployment, and a signed Android App Bundle still need to be configured.

## 1. Create the Play Console products

1. In Play Console, open the app with package name `com.wongwaiyut.growther` and finish the required app setup.
2. Go to **Monetize with Play > Products > Subscriptions** and create subscription `growther_premium_monthly`; add and activate an auto-renewing base plan whose ID is exactly `monthly`.
3. Create `growther_premium_annual`; add and activate an auto-renewing base plan whose ID is exactly `annual`.
4. Set actual market prices in Play Console. The app displays Play's localized prices when loaded. The monthly preview is now `฿200/month` (about `฿46/week`); the annual preview remains `$24.90/year`. These are preview values until you set matching store prices.

## 2. Give Supabase server-only access to Play purchase verification

1. In Google Cloud, enable the **Google Play Android Developer API** for the project associated with Play Console.
2. Create a service account in that Cloud project. In Play Console **Users and permissions**, invite its service-account email and grant the permissions needed to view app information and subscriptions/orders. Use the minimum access Google requires for the Developer API.
3. Create a JSON key for the service account and keep it private. In Supabase Dashboard, open **Project Settings > Edge Functions > Secrets** and add `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` with the complete JSON contents. Never put this key in the app, Git, or chat.
4. Set `GROWTHER_ALLOWED_ORIGINS` to include the Capacitor Android origin `https://localhost` and any production HTTPS site origin. Keep the existing localhost development origins if you use them.
5. Deploy the database migration and both Edge Functions from this project directory:

   ```powershell
   supabase db push
   supabase functions deploy verify-play-subscription
   supabase functions deploy scan-meal
   ```

6. Keep `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in Supabase Edge Function secrets as well. `scan-meal` checks Play's live subscription status before it calls the AI provider.

## 3. Create and upload an internal test build

1. Install Android Studio with Android SDK Platform 36 and install a Java 21 JDK. This computer currently has Java 17 and no Android SDK/adb, so it cannot yet build or sign the AAB.
2. Open this app's `android` folder in Android Studio and let Gradle sync. If it asks, set the Android SDK and JDK 21 paths.
3. In this project folder run:

   ```powershell
   npm run cap:sync
   ```

4. In Android Studio choose **Build > Generate Signed Bundle / APK > Android App Bundle**. Create an upload key and back it up securely; do not commit it or its passwords.
5. In Play Console open **Testing > Internal testing**, create a release, upload the signed `.aab`, add tester email addresses, and roll out the release.
6. Add the same tester accounts under **Setup > License testing**. Share the Play opt-in link and have testers install from Play Store; a sideloaded APK does not exercise real Play Billing.
7. Test both plans, purchase cancellation, restore, subscription management, and expired/canceled access. Confirm free accounts cannot call the AI endpoint successfully.

## 4. Important release checks

- A subscription is granted only when the backend validates the Play token, expected product/base plan, and future expiry. The backend acknowledges verified purchases and stores only a hash of each token to stop linking one purchase to multiple Growther accounts.
- The app's purchase verification is for Android / Google Play only. Apple requires its own StoreKit implementation and App Store Connect products.
- Do not enable paid AI purchases for youth accounts until guardian-consent and parent-payment requirements for the launch markets are implemented and reviewed.
- Current build output is not yet a signed `.aab`; complete the machine setup and steps above first.
