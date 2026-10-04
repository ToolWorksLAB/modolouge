# Verification — 4 October 2026

## Passed

- Production Next.js builds for both repositories using Node 24.
- Both repositories are public after a full Git-history credential scan. GitHub `main` automatically deploys production in the company Vercel Hobby team, without changing the plan or using the client workspace.
- Live sites: https://modolouge.vercel.app and https://modolouge-manager.vercel.app.
- Production Vercel OIDC exchange and AWS reads succeeded on both sites. The app role includes DynamoDB `ConditionCheckItem` for transactional service-state checks.
- Real Cognito hosted login, PKCE callback and encrypted session worked in the production browser with a temporary test account.
- Production browser example, `.ghx` upload and binary `.gh` upload all completed through private S3, SQS, Linux Compute and the viewport. Three sliders appeared; changing radius 12 to 20 changed the returned mesh X extent from 24 to 40.
- Seven production browser test jobs completed and recorded usage and approximate country/city. No browser errors were observed during the successful flow.
- An authenticated ordinary user was refused manager access. Anonymous dashboard requests return 401.
- Temporary deployment test account, 21 DynamoDB records and 12 S3 objects were removed; seven test jobs were deducted from the global daily allowance.
- 14 workspace tests: encrypted session rejection, expiry, blocked users, admin restriction, CSRF, cross-user result isolation, service-offline handling, filename/ID validation, numeric bounds and slider parity.
- 6 manager authentication tests.
- Desktop and mobile browser rendering of the two signed-out landing pages; no browser errors observed.
- Real AWS SQS → Linux worker → Rhino.Compute → private S3 → DynamoDB metering flow.
- Example preparation exposed three sliders. Radius 10 produced mesh X extent 20; radius 20 produced extent 40. Both solves returned geometry without errors.
- Both `.ghx` and binary `.gh` archives with embedded thumbnails parsed on Linux.
- Unknown component GUIDs, embedded script chunks and XML DTD input were rejected before Compute.
- AWS IAM simulations: manager can start/stop the designated Linux instance; public-app role cannot; manager cannot control the preserved Windows instance.
- Integration-test account, jobs, definition, usage events and stored objects removed after verification.

## Still pending

- Owner email verification and authenticated manager dashboard inspection. The owner must register and verify the configured administrator address. The initial signup contained a domain typo; the correct registration was not yet completed at report time.
- Actual email delivery to the owner's correctly spelled address. The temporary test identity used a suppressed invitation, so it does not establish inbox delivery.
- Live manager shutdown/restart cycle. Permission simulation passed; no EC2 stop/start was performed during this deployment work.

## Limits

29 explicit built-in component IDs are supported at initial launch, listed in `worker/component-policy.json`. Arbitrary Grasshopper definitions, scripts, clusters, expressions and unreviewed plugins are not supported. Processing is limited to 180 seconds; source/prepared/results expire after 24 hours (storage cleanup is asynchronous). Cost figures are estimates and require invoice reconciliation.

The Linux backend follows McNeel's Rhino 9 WIP guide; it is not a stable production release. The existing local Rhino Drop project remains available separately.
