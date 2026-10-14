# Local XPI adapter boundary

Status: `DOCUMENTED_NOT_LIVE_VERIFIED`. This contract is derived from the user-supplied XPI integration notes. It is a local validator boundary, not a dispatcher.

The validator accepts a JavaScript object that has already been parsed by a trusted YAML/manifest parser. This repository does not install or invoke a YAML parser, remote shell, SSH client, XPI command, or credentials. It never submits work.

The documented top-level fields are `topic`, `run_id`, `max_concurrency`, `max_attempts_per_lane`, `timeout_per_lane`, `retry_failed`, and `lanes`. The documented lane fields are `id`, `quota_group`, `workdir`, `taskbook`, `artifact_type`, `task`, and `donemark`. The local validator checks required types, unique lane IDs, concurrency in 1–10, positive attempts/timeouts, and single-line task text. It intentionally does not decide which artifact types or quota groups are valid, whether a path is authorized/pre-created, whether the model is free, or what remote exit/status values mean.

BIHIVE metadata belongs in a separate sidecar: article/version, stage, claim-set hash, dataset hash, chart-spec hash, parent review, input classification, expected artifacts, budget, and role/family identity checks. Those fields must not be injected into the XPI manifest until a live contract test proves the remote parser accepts them.

## Acceptance status

The checked-in tests exercise local valid/invalid object shapes only. Before dispatch, an authorized contract owner must verify a small remote test for: normal structured output; complete artifact with timeout; missing/truncated artifact; and injected 404/429 response. Preserve raw execution status separately from artifact validation and task outcome. Until those tests and a live registry/executor inventory exist, scheduling remains disabled and all capability claims stay unverified.
