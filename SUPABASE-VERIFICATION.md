# Supabase upgrade status — 4 October 2026

## Applied infrastructure

- Supabase `modolouge` (`nkifgvjtfwsojchttdvk`) in the ToolWorksLab Free organization, Stockholm. No Plantar3D resources were changed.
- Private Postgres tables for accounts, guest sessions, usage, network quotas and activity. Browser roles cannot read these tables or execute the quota functions.
- Atomic five-run trial enforcement and idempotent dispatch-failure compensation. Five preparations and five upload requests also bound guest resource use.
- Raw IP removal after 30 days, activity retention of 90 days, usage retention of 13 months, scheduled independently of compute uptime.
- Encrypted production Supabase environment variables configured in the existing company app and manager Vercel projects.
- Linux worker updated with durable outcome delivery to Supabase; current service is active. Secrets are excluded from the child compute process.
- Auth URLs restricted to the two company domains; email verification remains required. Email OTP expiry is 600 seconds, with eight-digit codes.

## Verified

- Both Next.js production builds pass.
- Workspace: 16 tests pass. Manager: 8 tests pass. Coverage includes session expiry/forgery, current account blocking, verified-email administrator checks, CSRF, linked guest-file isolation, numeric controls, and service availability guards.
- Live database concurrency test: 12 concurrent reservations across two guest identities on one test network accepted exactly five. A sixth run was denied. Repeated refunds deducted only once. A blocked guest was denied.
- Publishable-key requests could neither read private people/IP data nor call quota functions.
- Supabase security and performance advisors reported no findings.
- Local signup UI inspected. Local compute was unavailable because the preview has no AWS credentials; this is not evidence of a complete production compute flow.
- All temporary SQL test rows and the two zero-usage local preview guest rows were removed.

## Production release

Both company projects are deployed from their existing GitHub main branches:

- Workspace: commit `e611621`, deployment `dpl_6paPT8gFqWgrhiGb1BSLaEMnhrwc`, READY at https://modolouge.toolworkslab.com.
- Manager: commit `6eca4dd`, deployment `dpl_74CA9yGgMJYhLToBBPYC1wxXxqAE`, READY at https://admin.toolworkslab.com.
- Removed the Workspace/Manager switch from both sites. Each has independent navigation and host-only sign-in cookies.
- Hostinger SMTP saved in Supabase with SSL port 465 and the existing company mailbox. Both email templates use `supabase/templates/email-code.html` and the subject `Your Modolouge sign-in code`. Templates were reloaded and their previews verified. The owner confirmed receipt of the successful test email.
- Live browser upload of `parametric-sphere.ghx` completed with three exposed controls and a rendered mesh. Five solves completed after numeric and slider changes. Supabase recorded one preparation and five successful solves, including durations and the guest connection metadata.
- After five runs, the live UI opened the branded signup journey and retained the model. A fresh HTTP guest session on the same network reported zero remaining runs; a new upload returned HTTP 402 `TRIAL_EXHAUSTED`.
- Foreign-origin trial requests returned 403, unauthenticated manager data returned 401, and the development-only onboarding preview returned 404 in production.
- Five additional empty local-preview guest fixtures were removed. Production trial activity is retained as real service usage.

## Remaining owner-dependent checks

The owner has been sent a fresh code through the live manager sign-in page. Entering that code directly in the browser is still pending. Authenticated manager rendering, a live shutdown/restart cycle, and verified guest-to-member conversion with persisted onboarding have not yet been established by production browser tests. Earlier unit tests cover account authorization and guest-file ownership, and IAM simulation restricts start/stop access to the designated Linux instance.

Historical deployment checks are in `VERIFICATION.md`; they do not establish verification of this Supabase release. Cost figures remain estimates, and stopping EC2 retains storage and other possible charges.

## Onboarding design revision

- Replaced the single form card with a graphite/cream split layout, a deformable wireframe study, three-stage progress, email-code verification, personal introduction, first-experiment choices, and a personalized welcome.
- The same visual system serves manager sign-in. Returning accounts go straight back to the workspace; completing onboarding adds a relevant first-step prompt. Closing the overlay after verification updates the account state, while the current geometry remains mounted.
- Desktop browser preview exercised every screen, code entry, profile selection, starter selection, the final handoff, and the interactive sculpture. Production builds and all 24 existing tests pass after the revision. A browser viewport override did not take effect, so the phone breakpoint remains visually unverified.
- `/design/onboarding` is a development-only interactive design review: it sends no email and creates no account. The production build returns HTTP 404 for this route. The actual `/signin` page uses the live authenticated API flow.
- The local development console reports React's development-only `eval`/CSP warning. Production CSP was not weakened. Email delivery and live publication are now verified as described above.
