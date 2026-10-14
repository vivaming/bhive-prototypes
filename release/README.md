# Offline release safety contract

`contract.mjs` validates a release or rollback manifest against the exact bytes of `build-manifest.json`, every locked build artifact, and the current article/chart/data/policy hashes. It also binds a structured human-approval packet hash to those same version pins. A `HOLD`, stale approval, changed/missing artifact, duplicate release ID, or mismatched build manifest fails closed.

Rollback validation requires a prior manifest plus a local dry-run verification receipt whose manifest and build hashes still match; rollback target IDs and hashes must match exactly. The receipt is a local consistency record, not a signed or trusted deployment credential.

Run `pnpm release:qa` for the adversarial contract tests. `pnpm release:dryrun` validates the latest local `work/repro-a` bundle and writes `work/release-dry-run.json`; it is also part of `pnpm qa:all`. The test approval and release records are synthetic fixtures. A passing result means only `DRY_RUN_VALIDATION_PASS`; it always returns `releaseAuthorized: false`, `deployRequested: false`, `publishRequested: false`, and `externalCalls: 0`. No CMS connection, deployment, publication, release authorization, or production side effect exists here. Real human identity/signature verification and CMS release/rollback remain blocked on the unavailable review and publishing services.
