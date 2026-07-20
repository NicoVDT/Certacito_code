# Certacito.ai

> Govern your AI agents before they govern you.

Certacito.ai is a multi-agent AI governance and compliance platform. It intercepts every AI agent action in real time, enforces organisational policies, and keeps humans in the loop.

CSIT321 Capstone Project - Group 28, University of Wollongong.
Industry sponsor: Anthony Autore (AI Revolution 4 Technologies).

## Architecture

```
Agent (OpenClaw/Claude/etc)
    │
    ▼
┌─────────────────────┐
│  Interception Layer  │  ← Every tool call hits this first
└──────────┬──────────┘
           │
    ┌──────▼──────┐
    │Policy Engine│  ← YAML rules, version-controlled
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │   Decision  │  → PERMIT / DENY / ESCALATE
    └──────┬──────┘
           │
    ┌──────▼──────┐        ┌────────────────┐
    │  Audit Log  │        │ Approval Queue │
    │ (hash-chain)│        │  (human-in-loop)│
    └─────────────┘        └────────────────┘
           │
    ┌──────▼──────┐
    │  Dashboard  │  ← Real-time governance visibility
    └─────────────┘
```

## Quick Start (Docker - recommended for markers)

Requires Docker with the compose plugin. From the repo root:

```bash
docker compose up -d --build
```

That brings up PostgreSQL, Redis, the FastAPI backend (port 8000) and the
React frontend (port 3000). Then create the first account - the very first
registered user becomes the bootstrap Administrator:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@certacito.ai", "password": "test123", "role": "Administrator"}'
```

Open http://localhost:3000 and log in with those credentials.
API docs (Swagger) are at http://localhost:8000/docs.

## Quick Start (manual dev setup)

```bash
# database services
docker compose up -d postgres redis

# backend (needs python 3.11+)
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # then edit the secrets
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# frontend (separate terminal, needs node 18+)
cd frontend
npm install
npx vite --host 0.0.0.0 --port 3000
```

## Authentication model

Two kinds of callers, two kinds of auth:

- **Humans** (the dashboard) log in with email/password and get a JWT.
  Three roles, enforced at the API layer: **Administrator** (everything),
  **Analyst** (approve/deny, dry-run, demo), **Viewer** (read-only).
- **Agents** can't do a login flow, so the agent-facing endpoints
  (`/intercept`, `/guardrails/check`, `/risk/classify`) accept an
  `X-API-Key` header instead. The key is set via the `AGENT_API_KEY`
  env var. No key configured = no agent calls accepted (fail-closed).

User registration is admin-only (the first ever account bootstraps as admin).

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/intercept` | POST | API key or JWT | Evaluate an agent action against policy |
| `/api/v1/guardrails/check` | POST | API key or JWT | Semantic prompt-injection check |
| `/api/v1/risk/classify` | POST | API key or JWT | Risk scoring for an action |
| `/api/v1/audit` | GET | any role | Query the audit log |
| `/api/v1/audit/verify` | GET | any role | Verify hash chain integrity |
| `/api/v1/approvals` | GET | any role | List pending approval items |
| `/api/v1/approvals/{id}/approve` | POST | Analyst+ | Approve a pending action |
| `/api/v1/approvals/{id}/deny` | POST | Analyst+ | Deny a pending action |
| `/api/v1/policies` | GET/POST | any / Admin | List or create policy rules |
| `/api/v1/policies/{id}` | PUT/DELETE | Admin | Update or delete a rule |
| `/api/v1/policies/library` | GET | any role | Pre-built rule library |
| `/api/v1/dryrun` | POST | Analyst+ | Test a rule without side effects |
| `/api/v1/stats/dashboard` | GET | any role | Dashboard KPI aggregations |
| `/api/v1/reports/compliance` | GET | any role | Compliance report data |
| `/api/v1/agents` | GET/POST | any / Admin | Agent registry |
| `/api/v1/demo/healthcare-scenario` | POST | Analyst+ | Run the FR-11 demo walkthrough |
| `/api/v1/auth/register` | POST | Admin* | Create a user (*first user is open) |
| `/api/v1/auth/login` | POST | open | Login (returns JWT) |
| `/api/v1/ws/live` | WS | JWT via `?token=` | Live governance event feed |
| `/health` | GET | open | Service health check |

## Running the tests

```bash
source .venv/bin/activate
python -m pytest tests/ -q
```

Unit tests always run. The integration tests in `tests/backend/test_api.py`
need the API running on localhost:8000 and skip themselves otherwise.

## Tech Stack

- **Backend**: Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL, Alembic
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, shadcn/ui (component library)
- **Infrastructure**: Docker Compose, systemd, GitHub Actions CI
- **Auth**: JWT with bcrypt password hashing, RBAC (Admin/Analyst/Viewer), agent API keys
- **Audit**: SHA-256 hash-chained append-only log with PII masking

## Policy Engine

Rules are defined in `backend/policies.yaml` - outside the AI model, so they
cannot be jailbroken or prompt-injected away. The engine is fail-closed:
unknown actions are denied by default, engine errors deny, unreachable
governance API means the agent-side hook denies too.

Conditions are parsed properly now - see `backend/services/condition_parser.py`.
The grammar covers `==`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `NOT IN`, `CONTAINS`,
`NOT CONTAINS`, `MATCHES`, `NOT MATCHES`, `AND`, `OR`, `NOT` and parentheses.

Evaluation is three-valued - true, false or unknown - because "we could not
work this out" is not the same as "this is false". A missing payload field
makes a term unknown, unknown propagates through `NOT`, and only a definite
true matches. That is what keeps the engine fail-closed in both directions: an
unevaluable condition can neither satisfy a DENY rule nor a PERMIT one, and
negating something unevaluable cannot flip it to true.

This replaced a substring matcher that had `CONTAINS` unimplemented (so every
rule in `rule_library.yaml` using it silently never matched), evaluated `>=`
as `float("= 100")`, and lowercased quoted literals.

## Documentation (A4 appendix set)

- `docs/requirements-traceability.md` - RTM against the A2 baseline
- `docs/architecture.md` - all layers + diagrams
- `docs/functionality.md` - system functionality and expected user interaction
- `docs/interface-design.md` - what changed since the A3 designs and why
- `docs/branding-style-guide.md` - brand, colours, typography, components
- `docs/contribution-table.md` - who built what
- `docs/screenshots/` - current screens from the running system
