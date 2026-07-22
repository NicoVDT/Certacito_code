# Requirements Traceability Matrix - Certacito.ai (Group 28)

Status as of 12 July 2026, against the A2 requirements baseline.
Priority follows MoSCoW. "Evidence" points at where a marker can verify.

| ID | Requirement | Type | Priority | Status | Evidence / Notes |
|----|-------------|------|----------|--------|------------------|
| FR-01 | Pre-execution interception layer, fail-closed | F | Must | **Done** | `POST /api/v1/intercept` (backend/api/interception.py). Engine errors deny; agent-side hook denies if the API is unreachable; no matching rule denies. Agent calls authenticate with `X-API-Key`. |
| FR-02 | Deterministic policy engine, rules in version-controlled config | F | Must | **Done (with limitation)** | Rules in `backend/policies.yaml`, git-tracked, evaluated in `backend/services/policy_engine.py`. **Limitation:** rule `conditions` use a simplified keyword matcher, not a full expression parser - matching is primarily on `action_type`. A CEL-style parser is planned post-A4. |
| FR-03 | Immutable audit logging, SHA-256 hash chained | F | Must | **Done** | `backend/services/audit.py`. Each entry hashes the previous one; `GET /api/v1/audit/verify` recomputes the chain (70k+ entries, valid), one-click "Verify chain" in the audit UI. A race that let concurrent appends fork the chain was found via the verify test and fixed with an append lock (repair tool pending). Append-only is enforced at app level; a DB-level guard (trigger/permissions) is planned for production. |
| FR-04 | RBAC (Administrator/Analyst/Viewer) enforced at the API layer | F | Must | **Done** | JWT + bcrypt. Every endpoint carries an auth dependency (see README endpoint table). Self-registration disabled: user creation is admin-only, first account bootstraps. Regression tests in `tests/backend/test_api.py` (RBAC section). |
| FR-05 | Human-in-the-loop approval queue with SLA auto-reject | F | Must | **Done (with limitation)** | `backend/services/approval_service.py`. High/Critical escalations pause into the queue; reviewer identity comes from the JWT, not the request body. **Limitation:** SLA expiry is evaluated lazily when the queue is read, not by a background scheduler - fine while the dashboard polls, a worker task is planned for production. |
| FR-06 | Real-time governance dashboard (<2s to surface events) | F | Must | **Done** | WebSocket push (`/api/v1/ws/live`, JWT-authenticated) with a 10s polling fallback. Live feed, KPI tiles, risk donut, top violations. The dashboard socket now authenticates correctly (the deployed build was silently falling back to polling). |
| FR-07 | Secure Azure deployment (CI/CD, Key Vault, TLS 1.3) | NF | Must | **Done (with limitation)** | Live on an Azure VM in `australiaeast` (Ubuntu 24.04, Standard_B2ls_v2), Docker Compose: Postgres 16 + Redis 7 + a single app image that serves the API and the built frontend. Deploy is `infra/scripts/deploy-vm.sh`, triggered over SSH by `.github/workflows/deploy.yml`; the CI key is pinned to a forced command so it can only run that script. CI runs on every push and is green. Runbook: `docs/azure-deployment.md`. **Limitation:** App Service and Key Vault were dropped in favour of a plain VM (cheaper against student credit, and it hosts the governed agent alongside the platform). Secrets are environment variables in a chmod-600 `.env`, so a secret manager remains a config change rather than a code change. TLS 1.3 is not yet on the platform itself - only the agent console is behind a certificate; a custom domain plus certificate is outstanding. |
| FR-08 | Semantic guardrails (prompt-injection detection) | F | Should | **Done** | `backend/services/semantic_guard.py`, wired into `/intercept` and exposed at `/guardrails/check`. Blocks instruction-override and exfiltration patterns. |
| FR-09 | Risk classification engine (Low/Med/High/Critical) | F | Should | **Done** | `backend/services/risk_classifier.py`, `/api/v1/risk/classify`. High/Critical feeds FR-05 escalation. |
| FR-10 | Policy rule library (5+ pre-built regulated-industry rules) | F | Should | **Done (exceeds)** | 10 rules in `backend/rule_library.yaml`, each tagged with its regulatory alignment (Privacy Act 1988, My Health Records Act, APRA CPS 234, ...). Import via `/api/v1/policies/library`. |
| FR-11 | Group 2 integration demonstration (GP office agent) | F | Should | **Blocked (external)** | Waiting on Group 2's agent API contract. The repeatable healthcare scenario (`POST /api/v1/demo/healthcare-scenario`) demonstrates the same end-to-end flow against simulated GP-office actions in the meantime. |

## Changes since A2

- **Added:** agent API-key authentication for machine callers (A2 assumed JWT everywhere; agents cannot do an interactive login).
- **Added:** live traffic simulator for demo/testing (not a requirement, supports FR-06 demonstration).
- **Changed:** FR-07 deployment target is staged on Proxmox LXC first, Azure second. Same containerised architecture; the staging environment is what A4 demonstrates.
- **Removed:** nothing removed from the Must/Should sets.

## Non-functional requirements snapshot

| NFR | Status | Notes |
|-----|--------|-------|
| Fail-closed everywhere | Done | Deny on engine error, on unknown action, on unreachable API, on missing agent key. |
| PII masking before storage | Done (top-level fields) | Nested payload masking is a known gap, planned before production. |
| Interception latency | Done | Policy evaluation is in-memory; measured well under agent timeout budgets. |
| WCAG 2.1 AA (risk never colour-only) | Done | Risk badges carry text labels + icons across all screens. |
| Test coverage | 44 tests | Unit (policy, audit, risk, semantic guard) + live integration incl. RBAC regression tests. |
