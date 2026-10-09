# Growther youth account release plan

Scope confirmed by the owner: ages 10–17 in Thailand and the USA should eventually have cloud backup and AI meal analysis after verified guardian consent. This document is an implementation plan, not a claim that the current app is ready for youth online accounts.

Verification choice: build and review the process in-house. The proposed first version is manual guardian verification, with a trained reviewer checking the guardian's identity and relationship to the child during a live session. A parent email reply or checkbox alone must not change the child account to approved. The exact evidence, method, and retention schedule require legal/privacy review before implementation or collection.

## Current safeguard

The app accepts youth ages for local use. Google sign-in, cloud backup, and the AI meal service remain adult-only. The server checks the adult `profiles.age_band`; the app now signs out an active cloud session if the local profile changes to under 18. The adult age is self-reported, so this is a temporary gate, not age verification.

## Before enabling youth online access

1. Put a neutral age and country screen before any account creation or analytics that collect personal data. For a child, collect only the minimal guardian contact detail needed to start the parent notice and consent process until consent is verified. Do not initiate child Google OAuth at that point.
2. Publish a child-specific privacy notice and direct guardian notice. Explain profile/log storage, optional backup, photo transfer to the scan service and AI provider, scan feedback email, retention periods, and each recipient. Obtain consent for cloud storage and the photo/AI disclosure at the scope required by counsel. Keep proof of notice version, purpose grants, verification method, date, and revocation.
3. Use a verifiable parental consent method suitable for U.S. under-13 users and the intended third-party AI disclosure. A checkbox or an unverified guardian email alone is insufficient. Independently review the in-house method and train the reviewers. Do not store the guardian's identity document in Growther.
4. Provision the child's cloud identity only after a verified guardian approval. Use separate guardian and child identities, with a server-owned guardian-child link. The child must never be able to set their own consent status from browser code.
5. Add a server-side `can_use_cloud_data` rule requiring a valid, unrevoked guardian grant for youth. Add the same check to scan and support endpoints. Treat different purposes separately; a backup grant must not automatically authorize a meal photo transfer.
6. Provide a guardian dashboard or authenticated support process to inspect/export the child's data, revoke future collection, and delete the child's account/data. Revocation must block new uploads and scans immediately. Define what happens to existing backups, account sessions, support emails, and any photos.
7. Set a written retention/deletion schedule and service-provider agreements. Test with disposable guardian/child accounts in both country paths, including revoked consent, expired verification, cross-account access, deletion, and recovery. Obtain jurisdiction-specific legal/privacy review before removing the adult-only gate.

## Proposed in-house operating flow

1. A guardian starts enrollment and receives the child-specific notice. Before verification, the system stores only the guardian's contact address, the child's age range/country, and a short-lived request identifier needed to arrange the review. No child Google OAuth or meal data is accepted.
2. A trained reviewer performs a live identity and relationship check using a counsel-approved method. Do not record the call or upload identity documents to the app. The reviewer records a signed decision, method code, notice version, purpose-specific grants, and timestamp in a server-only audit table. A second reviewer or supervisor handles uncertain cases.
3. Only an approved grant lets the server create or link a child account. Server policy checks the grant on every backup and AI request. A pending, rejected, expired, or revoked grant blocks those requests.
4. The guardian has a secure way to see the child's stored categories, export/delete them, revoke a purpose, and contact support. Revocation immediately blocks access and follows the published retention/deletion schedule.

This is a design proposal. It needs a legal determination that the chosen live-review evidence actually verifies parental responsibility in each launch country and is suitable for AI provider disclosure. It also needs an operator who can perform reviews and respond to guardian requests; code alone cannot complete those steps.

The U.S. FTC says covered under-13 collection generally requires direct parental notice and verifiable parental consent, and parents need access and deletion controls. Its guidance also addresses separate consent for third-party disclosure and a written retention/deletion policy. Thailand's PDPA section 20 sets rules for minors' consent and the holder of parental responsibility. The exact application to Growther and age 13–17 users needs qualified review.

Primary sources:

- [FTC COPPA compliance plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- [FTC COPPA FAQs](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [Thai Ministry of Digital Economy and Society PDPA translation, section 20](https://www.mdes.go.th/law/detail/3577-Personal-Data-Protection-Act-B-E--2562--2019-)
