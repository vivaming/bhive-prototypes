# WP0 foundation audit

Audit date: 2026-10-09. Repository: `bhive-prototypes`. This is a local repository audit; no remote executor, registry, deployment host, or credential store was accessed.

## Repository and delivery path

- Checked branch: `codex/bihive-visual-rework`; checked baseline: `625fa2d23db32eb93a2989f4f4c1cd99852c877b`.
- No `AGENTS.md` or repository `README.md` was present at the checked tree.
- The runtime is the static page `treemap-v3-12.html`; `scripts/build-repro.mjs` copies an explicit allowlist into a reproducible static bundle. `.github/workflows/qa.yml` runs QA only. No deployment or publishing workflow, content API, server-side admin, or production toggle is present in this checkout.
- The `origin` Git remote exists. That does not establish which branch or artifact is publicly served. Hosting path, branch protection, cache invalidation, and rollback behavior remain unverified.
- `treemap-admin.html` and the fleet pages are prototypes/snapshots; no backend contract was found in the application or workflow files. Browser `localStorage` state is not a durable review or publication system.

## Data and chart provenance

- Most card text and chart values are embedded directly in `treemap-v3-12.html`. They are not backed by a checked-in article/source registry or normalized analytical snapshot.
- `POLL_HISTORY` contains nine positional numeric values for each party and the line chart labels those positions Jan–Sep. It has no per-observation date, survey-period detail, sample/method metadata, raw source URL, source row, or revision/vintage identifier. The accompanying latest party snapshot and the 47.8% Herald aggregate are also inline values.
- Existing labels such as “Curia poll, 3 September” and article-source captions are prototype attribution text, not a retained source record. Until a source document/page and exact observation mapping are captured, the poll series is classified `UNVERIFIED_LEGACY_FIXTURE`; data/transform checks can pass while the provenance/release gate remains HOLD.
- Other existing fiscal, policy, and trend charts have captions naming outlets or agencies, but this repository does not contain sufficient source-row lineage to call them verified. This pass does not change those values or upgrade their evidence status.
- Photo provenance is stronger: `assets/photos/photo-catalog.lock.json`, per-image evidence, license records and hashes are checked by the existing media QA. These records do not verify chart data.

## XPI integration status

`outputs/bihive-editorial-workflow-plan-2026-10-09/XPI_CURRENT_INTEGRATION.md` and its bundled `reference/69_xpi_workflow.md` describe a controller on `.65`, an execution host on `.69`, and a `split_dispatch.sh` manifest shape. This is user-provided documentation, not a live contract test. This repository contains no `.65` parser, live manifest fixture, registry snapshot, or executor identity evidence. No remote dispatch has been attempted.

The local adapter contract and validator accept an already-parsed object and validate only documented structural constraints. They do not parse YAML, create directories, contact XPI, decide model eligibility, or submit a task. Unknown artifact types and path roots must be checked against the live parser by an authorized owner before dispatch can be enabled.

## Current safe boundary

The public build allowlist contains site/runtime assets only. WP0 integration notes, model/executor status, test manifests and any future review evidence belong under `docs/internal/` or `integrations/` and must remain outside `scripts/build-repro.mjs`'s public allowlist. No production publishing, credentials, paid routing, model calls, or external notifications are configured by this audit.

## Required evidence before advancing

1. Authorized live contract test against the `.65` parser: accepted manifest fields, supported artifact types, path roots, return codes, statuses, retries, timeout, and idempotency behavior.
2. Authorized registry snapshot for actual model IDs/families, shared account/quota identity, current free status, and role-specific evaluation. Documented quota-group names are not model or capacity verification.
3. Executor inventory for `.65` and `.69` with host roles, access permissions, WSL/runtime versions, output encoding, task persistence, heartbeat and stop/reclaim behavior.
4. Verified source snapshot and observation-to-date map for the poll fixture before its data gate can move from HOLD.
5. Deployment owner confirmation for target branch, preview/prod boundary, publication idempotency, URL verification and rollback.
