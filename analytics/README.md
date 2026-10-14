# Local analysis and evidence contract (v1)

`evidence-bundle.schema.json` describes a local bundle of source records, a locked row snapshot, a data dictionary, an analysis plan, deterministic results and a claim ledger. `contract.mjs` is the executable validator and calculation adapter. Its allowlisted arithmetic is intentionally small (`sum`, `difference`, `percentage_points`, `percent_change`); unsupported operations fail closed.

Run `pnpm analytics:qa` to validate the positive synthetic example and adversarial mutations. The example is explicitly marked synthetic, its source URL is null, hashes are computed from its retained text/rows/plan, all prose claims have row or result references, and every result is recomputed. The validator checks numeric claims against their cited field/result and keeps “percent” separate from “percentage points.”

`validationStatus: PASS` means the local bundle is internally consistent. It does not attest that source material is true or that an editor reviewed it. `releaseGate` is unconditionally `HOLD` in this offline adapter. No real source snapshot has been ingested or verified. Real-source HTML/PDF parsing, signed reviewer attestations, source independence checks and trusted release authorization remain blocked on a configured evidence service. The local sample must never be presented as a New Zealand statistic.

The raw text hash proves which bytes the bundle retained; the parsed-row hash proves the table that the analysis used. A real ingestion adapter must additionally show deterministic parser/version provenance and reviewed row-to-source locators before production use. `publishedAt`, `capturedAt`, `retrievedAt` and `vintage` are separate fields so revisions and timing cannot be silently collapsed.

Adversarial examples cover stale hashes, missing locators, dictionary omissions, mixed vintages, unknown transforms, zero baselines, tampered calculations, mismatched result versions, unsupported prose claims, ungrounded quotes, insecure source URLs, incorrect percentage-point arithmetic and attempts to promote a local bundle to release.
