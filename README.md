# Modolouge

ToolWorksLab's public Grasshopper workspace. A Next.js frontend on Vercel submits asynchronous jobs to an Ubuntu EC2 Rhino.Compute 9 worker. Drag in a supported `.gh` or `.ghx`, adjust sliders, and update the Three.js viewport.

## Production

- GitHub: `ToolWorksLAB/modolouge`, production branch `main`.
- Vercel team: `info-85726815s-projects` / `team_D2suiiZSHHspd8E4WqQuvMeY` (company workspace).
- Administrator: `info@toolworkslab.com`; separate `ToolWorksLAB/modolouge-manager` repository.
- AWS region `eu-north-1`; Linux instance `i-0c6e3386ff6d66b5b` only. Existing Windows instances are outside these controls.

The public repository is connected to the company Vercel Hobby workspace. Pushes to `main` deploy production at [modolouge.toolworkslab.com](https://modolouge.toolworkslab.com). Administration is at [admin.toolworkslab.com](https://admin.toolworkslab.com). The previous Vercel addresses redirect to these canonical domains. See [verification status](VERIFICATION.md).

## Develop

Node 24: `npm ci`, `npm run dev`. Production build: `npm run build`. Production authentication uses Supabase email codes and HTTPS. Localhost cookies are supported for development. Do not add a production auth bypass for local development.

Required server environment: `APP_URL`, `SESSION_SECRET` (random 32+ bytes), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `IP_HASH_SECRET`, `AWS_ROLE_ARN`, `AWS_REGION`, `DATA_TABLE`, `FILE_BUCKET`, `JOB_QUEUE_URL`. Never expose these through `NEXT_PUBLIC_` or commit `.env` files.

Production AWS access uses Vercel OIDC, restricted to the company team, this project, and `production`. No static AWS access keys are used. Preview deployments have no production role. Cookies are encrypted, HTTP-only, Secure and SameSite=Lax; Supabase validates email codes; every authenticated API call validates the current Supabase user and verified email. Refresh tokens stay inside encrypted server cookies. Every mutation checks Origin and server-side account state.

## Worker

`worker/install.sh` installs the runtime and worker under `/opt/modolouge-worker`, publishes the source-only GH_IO archive bridge against the installed Rhino Linux DLL, and starts systemd services. Proprietary Rhino DLLs and the billing token are not included in this repository. The existing root-only Rhino environment remains on the EC2 host.

The browser uploads directly to private S3 with a short-lived signed POST. The API stores an owner-scoped definition, enforces quotas transactionally, and enqueues an SQS message. The worker validates an explicit component-ID allowlist before calling loopback Rhino.Compute, stores a preview result in S3, and atomically records job usage. Job/result authorization checks the current user, including blocked state.

Public compatibility is deliberately limited to `worker/component-policy.json`. Script, cluster, expression and unknown plugin components are rejected. This is not an arbitrary code sandbox. Expand the list only after reviewing component behavior, archive deserialization and resource limits. Current limits: 20 MB upload, 500 components, 60 jobs/account/day, 600 shared jobs/day, one outstanding job/account, three-minute processing limit, 40 MB result. Definition preparation counts as a job. Temporary source/prepared/result files expire after 24 hours with asynchronous S3 cleanup.

## Manager and costs

The manager uses a separate OIDC role with start/stop permissions restricted to the Linux instance. It remains online when compute stops. Stopping prevents new jobs and stops EC2; it does not delete storage or other AWS resources.

Rhino.Compute Linux is McNeel WIP software with plugin and production-readiness limitations; see the [official guide](https://developer.rhino3d.com/guides/compute/compute-linux-getting-started/).

Cost attribution uses measured processing seconds at configured EC2 + IPv4 + Rhino rates. Shared runtime is metered uptime minus recorded job processing. The Rhino billable core count is an explicit assumption; verify it against billing. Estimates exclude taxes, data transfer, storage requests, Supabase, Vercel and other resources. This is not a billing invoice.

## Design

Derived from ToolWorksLab's own `TWLWeb` website: graphite `#0A0D0F`, cream `#FFFFF8`, magenta `#E91B8C`; Poppins body text, monospace headings, pill navigation, generous spacing and geometric line artwork. Shared files in the two repositories must remain in sync, except `lib/config.js`'s manager flag, metadata and deployment environment.

## Operations

Inspect `systemctl status modolouge-worker rhino-compute` and sanitized journald logs. Never print `/etc/rhino-compute/environment`. The worker uses the instance profile for S3/DynamoDB/SQS; Rhino's service is denied access to instance metadata. Start/stop and account blocking are audited in DynamoDB. Cloud provider billing remains the source of truth.

## Supabase and guest onboarding

Supabase project `nkifgvjtfwsojchttdvk` belongs to `toolworkslab` (`qymmqoaxeukktwjcsyet`), on Free in eu-north-1. Migrations are in `supabase/migrations`. Accounts, onboarding profiles, visitor activity, IP addresses, trial quotas and compute usage are in Postgres. DynamoDB remains the compute dispatch/state store; S3 stores private definitions/results and SQS dispatches Linux work. Cognito is no longer the sign-in provider. Historical Cognito usage remains visible in the manager. Existing users verify their email again in the new flow.

The public first screen is the working viewport/drop zone. Guests receive five geometry solves, with at most five preparations and five file uploads. PostgreSQL row locking and network quota enforce the allowance across parallel requests and cookie resets. Browser and network allowances expire after 30 days; shared networks can share the trial allowance. Failed dispatches refund quota idempotently; executed jobs consume it. Verified accounts keep the 60 jobs/day compute limit. Existing definitions can be used by a verified account after the signed guest session is linked.

The account flow uses an emailed code, then optional-context onboarding (name, discipline, intention). Keep both the Supabase confirmation and magic-link templates configured with `{{ .Token }}`. Custom Hostinger SMTP is required for public email delivery. Set OTP expiry to 600 seconds. Account administration always checks the current verified Auth email `info@toolworkslab.com`, never editable user metadata. All application tables enable RLS and deny browser roles; mutations and private activity use the server key only.

Visitor activity includes trial creation, verification requests, signup conversion, onboarding, uploads, queued jobs, outcomes and measured duration. Raw IPs are removed after 30 days, activity after 90 days, and usage after 13 months by a Supabase cron job independent of EC2 uptime. The manager refreshes every 15 seconds and shows the latest 100 activity records and 1,000 people. IP locations are approximate. SQL quota and access checks should be tested when changing these rules.

The worker reads `/etc/modolouge-backend.env` through its systemd environment configuration. Store SUPABASE_URL and SUPABASE_SECRET_KEY there as root-only mode 0600 before starting a fresh installation. The secret is removed from the child computation environment. DynamoDB SUPABASE_OUTBOX is written atomically with the job outcome; heartbeat retries deliver it to Supabase before deleting the outbox row. This avoids losing metering if Supabase is temporarily unavailable. Never log or commit the environment file.
