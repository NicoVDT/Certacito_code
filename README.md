# Certacito.ai

> Govern your AI agents before they govern you.

Certacito.ai is a multi-agent AI governance and compliance platform. It intercepts every AI agent action in real time, enforces organisational policies, and keeps humans in the loop.

CSIT321 Capstone Project - Group 28, University of Wollongong.
Industry sponsor: Anthony Autore (AI Revolution 4 Technologies).

---

## For markers: the system is already running

**You do not have to install anything.** A deployed instance is live and is the
same commit as this repository:

| | |
|---|---|
| **Dashboard** | **http://20.92.93.30** |
| **Sign in** | `admin@certacito.ai` / `test123` |
| **API docs (Swagger)** | http://20.92.93.30/docs |
| **Health check** | http://20.92.93.30/health |

It is an Azure VM in `australiaeast`, deployed by GitHub Actions on every push
to `main`, so what you see is what is in this repo.

**Availability:** the VM is shut down daily between **01:00 and 06:00 AEST** to
conserve student credit, and is up the rest of the day. If it does not respond
outside those hours, please contact the group and we will bring it back up. Once
marking is complete, please let us know so the deployment can be torn down.

### A five minute tour that proves the system works

1. **Sign in** and land on the Governance Dashboard. The KPI tiles, live feed
   and charts are read from the database, not hardcoded.
2. **Run the governance scenario.** In Swagger, `POST /api/v1/demo/healthcare-scenario`
   (click *Authorize* first and log in). It pushes five realistic GP-office
   actions through the **real** policy engine and returns expected vs actual for
   each: a permitted record read, a denied out-of-scope patient access, a prompt
   injection blocked by the semantic guard, a permitted referral letter, and an
   external email escalated for human approval.
3. **Check the audit log** (Activity -> Audit log). Every decision from step 2 is
   there with its masked payload, matched rule and SHA-256 chain hash. Expand a
   row to see the decision trail.
4. **Verify the chain.** Press **Verify chain**, or `GET /api/v1/audit/verify`.
   It re-walks the log from a fixed genesis entry and recomputes every hash
   rather than trusting the stored ones.
5. **Work the approval queue** (Activity -> Approval queue). The escalated email
   from step 2 is waiting with an SLA countdown. Approve or deny it; your
   identity is taken from your JWT and recorded against the decision.
6. **Try to break it.** `POST /api/v1/intercept` with an action no rule covers,
   and it is denied by default. Drop the auth header and it is refused outright.
   The system fails closed, which is the whole argument.

Everything above is also reproducible locally with the Docker quick start below.

### Testing it as an agent would

Steps 2 to 6 exercise the system through the dashboard and Swagger. To hit it the
way a governed agent does, call `/api/v1/intercept` directly with the agent API
key. Agents cannot perform a login flow, so they authenticate with a header
instead of a JWT:

```bash
# permitted - an approved tool
curl -X POST http://20.92.93.30/api/v1/intercept \
  -H "Content-Type: application/json" -H "X-API-Key: $AGENT_API_KEY" \
  -d '{"agent_id":"AGT-openclaw-azure","action_type":"tool_invoke",
       "payload":{"tool":"appointment_lookup","input":"clinic opening hours"}}'

# denied - restricted dataset
curl -X POST http://20.92.93.30/api/v1/intercept \
  -H "Content-Type: application/json" -H "X-API-Key: $AGENT_API_KEY" \
  -d '{"agent_id":"AGT-openclaw-azure","action_type":"data_access",
       "payload":{"target":"patient_records","destination":"external drive"}}'

# escalated - external recipient, needs a human
curl -X POST http://20.92.93.30/api/v1/intercept \
  -H "Content-Type: application/json" -H "X-API-Key: $AGENT_API_KEY" \
  -d '{"agent_id":"AGT-openclaw-azure","action_type":"email_send",
       "payload":{"to":"specialist@external-clinic.com.au","subject":"Referral"}}'
```

Those return PERMIT / DENY / ESCALATE with the matched rule and a decision id, and
each one lands in the audit log. **Markers: the key is not in this repository.**
Ask the group for it, or use the same requests with your admin JWT
(`Authorization: Bearer <token>`), which the endpoint also accepts. Without either
you get a 401, which is itself the fail-closed behaviour being demonstrated.

### The agent side of the loop

The governed agent used in the demonstration is **OpenClaw** running the
`claude-cli` runtime. It is not part of this repository, because the point of the
architecture is that the governance layer does not depend on which agent
framework sits in front of it. Two integration paths exist:

- **Wrapper hooks** (used for the demo). Every tool the agent can invoke is a
  shell wrapper that POSTs to `/api/v1/intercept` first and refuses to run the
  underlying command unless the response is PERMIT. An exec gate does the same
  for arbitrary shell calls. If the governance API is unreachable the wrapper
  denies, so pulling the plug on Certacito stops the agent rather than freeing it.
- **SDK callback** for Python agents: `backend/agents/langchain_interceptor.py`.
  `CertacitoGovernanceHandler.check_tool_call()` maps a LangChain tool call to an
  action type, calls the API and returns a `GovernanceDecision`; an exception
  path returns DENY with rule `FAILSAFE`. Sync and async both provided.

The interception contract is the same either way, which is what lets the demo
scenario, the traffic simulator, the LangChain handler and a live agent all show
up in one audit log.

**The agent console itself is not published here.** It is an interface that
executes tool calls on a host, so its address and access token are shared with
the supervisor directly rather than committed to a public repository. Ask the
group for a supervised walkthrough if you want to see the agent driven live.

---

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

## Quick Start (Docker - if you would rather run it yourself)

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

Note the two compose files. `docker-compose.yml` (above) is the development
stack: four containers, frontend and API on separate ports. `docker-compose.azure.yml`
is what production runs: one image serving the built frontend and the API on the
same origin, which is why the deployed system has no `:3000`.

To tear it down again: `docker compose down -v` (the `-v` also drops the
database volume).

## Quick Start (manual dev setup)

```bash
# database services
docker compose up -d postgres redis

# backend (needs Python 3.13+)
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
cd backend && python -m pytest ../tests/backend/ -v
```

105 tests. The unit tests (policy engine, condition parser, audit chain, risk
classifier, semantic guard, rate limiter, password hashing) always run. The
integration tests in `tests/backend/test_api.py` need the API up on
localhost:8000 and skip themselves otherwise, so start the stack first if you
want the full run.

CI runs the whole suite on every push, plus a frontend typecheck (`tsc --noEmit`)
and a production build. Both are worth a look in `.github/workflows/ci.yml`: the
typecheck exists because `vite build` strips types without checking them and let
a broken component through, and the frontend install uses `npm ci` rather than
`npm install` so CI fails the same way the production image would.

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

- `docs/requirements-traceability.md` - RTM against the A2 baseline, with build order and dependencies
- `docs/sprint-progress.md` - the six A2 sprints, what each delivered and what it did not
- `docs/architecture.md` - all layers + system diagram + entity relationship diagram
- `docs/functionality.md` - system functionality and expected user interaction
- `docs/interface-design.md` - what changed since the A3 designs and why
- `docs/branding-style-guide.md` - brand, colours, typography, components
- `docs/contribution-table.md` - who built what, and the supervisor approval record
- `docs/screenshots/` - current screens from the running system, plus both diagrams

The same set is also provided as branded PDFs in `docs/pdf/` and as Word
documents in `docs/docx/`, generated by `docs/build-docx.py` and
`docs/build-pdfs.mjs`.

## Where things live

| Looking for | Path |
|---|---|
| The governance decision itself | `backend/api/interception.py` |
| Policy rules (git-tracked, outside the model) | `backend/policies.yaml` |
| Rule evaluation and precedence | `backend/services/policy_engine.py` |
| Condition grammar and three-valued logic | `backend/services/condition_parser.py` |
| Hash chain and verification | `backend/services/audit.py` |
| Prompt-injection detection | `backend/services/semantic_guard.py` |
| Human-in-the-loop queue and SLA | `backend/services/approval_service.py` |
| Roles and API-key auth | `backend/api/auth.py` |
| Database tables | `backend/models/tables.py` |
| Dashboard screens | `frontend/src/app/` |
| Deployment | `docker-compose.azure.yml`, `infra/scripts/deploy-vm.sh` |
