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

## Release pending

The new app and manager code has not been deployed to production. Existing production pages still use the earlier authentication implementation.

1. Owner enters the `info@toolworkslab.com` Hostinger mailbox password in the prepared Supabase SMTP form and saves it.
2. Apply `supabase/templates/email-code.html` to both Confirm signup and Magic link templates, with subject `Your Modolouge sign-in code`. Custom SMTP is required before template changes on this Free project.
3. Verify delivery to the owner's actual inbox without bypassing email ownership.
4. Deploy both reviewed repository changes through their existing main-branch production integrations.
5. Test guest upload/slider/geometry, the sixth-run gate, verified signup with workspace preservation, onboarding, and manager visibility end to end.
6. Owner signs into the manager; authenticated dashboard and live shutdown/restart inspection remain pending. Earlier IAM simulation proved access only to the designated Linux instance, but a real stop/start cycle has not been performed.

Historical deployment checks are in `VERIFICATION.md`; they do not establish verification of this Supabase release. Cost figures remain estimates, and stopping EC2 retains storage and other possible charges.
