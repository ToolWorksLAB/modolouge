# Verification — 4 October 2026

## Passed

- Production Next.js builds for both repositories using Node 24.
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

- Vercel Git integration and live production URLs: Vercel returned HTTP 409 `repo_owned_by_org` for each private ToolWorksLAB repository on the connected company's Hobby plan. Owner requested no upgrade while investigating. No client workspace was used.
- Production Vercel OIDC token exchange and runtime environment configuration.
- Live Cognito browser sign-up/verification/callback on the final production URLs.
- Authenticated viewport and manager browser verification against deployed APIs.
- Live manager shutdown/restart cycle. Permission simulation passed; no EC2 stop/start was performed during this deployment work.

## Limits

29 explicit built-in component IDs are supported at initial launch, listed in `worker/component-policy.json`. Arbitrary Grasshopper definitions, scripts, clusters, expressions and unreviewed plugins are not supported. Processing is limited to 180 seconds; source/prepared/results expire after 24 hours (storage cleanup is asynchronous). Cost figures are estimates and require invoice reconciliation.

The Linux backend follows McNeel's Rhino 9 WIP guide; it is not a stable production release. The existing local Rhino Drop project remains available separately.
