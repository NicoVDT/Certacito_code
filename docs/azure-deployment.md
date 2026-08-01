# Azure Deployment Runbook (FR-07)

How the system is deployed to Azure. This describes the running production
deployment, not a plan.

## What it actually runs on

A single Azure VM, `certacito-vm`, Standard_B2ls_v2 (2 vCPU / 4 GiB), Ubuntu 24.04
LTS, in `australiaeast`. Public IP **20.92.93.30**, admin user `azureuser`, SSH by
key only. NSG allows 22, 80 and 443.

The whole stack is Docker Compose on that one box. There is no App Service, no
managed database and no Key Vault. That was the original plan and it was dropped:
a VM was cheaper against student credit, and it let us host the governed agent
alongside the platform, which the demo needs.

### Services

`docker-compose.azure.yml`, three containers:

| Service | Image | Notes |
|---|---|---|
| `postgres` | postgres:16-alpine | named volume `pgdata`, healthcheck gates the app |
| `redis` | redis:7-alpine | rate limiting, transient state |
| `app` | built from `infra/docker/Dockerfile.azure` | published `80:8000` |

`app` is a two-stage image. Stage one runs `npm ci` then `vite build`; stage two
installs the Python dependencies and copies the built frontend in as
`frontend_dist/`, which FastAPI serves at `/`. One container serves both the API
and the SPA, so there is no nginx and no second app.

### Configuration

`~/certacito/.env` on the VM, chmod 600, not in the repository. It holds
`SECRET_KEY`, `AGENT_API_KEY` and `POSTGRES_PASSWORD`; `DATABASE_URL` and
`REDIS_URL` are composed in the compose file. These are freshly generated values,
deliberately not the ones used on the staging container.

Because every secret is already an environment variable, moving to a secret
manager later is a config change rather than a code change.

## Deploying

`infra/scripts/deploy-vm.sh` on the VM does the whole thing:

```bash
git fetch --quiet origin main
git reset --quiet --hard origin/main
[ -f .env ] || { echo "no .env on this box, refusing to deploy"; exit 1; }
docker compose -f docker-compose.azure.yml up -d --build
# then polls /health for up to 60s before reporting success
```

The `.env` guard matters: `git reset --hard` would otherwise be one typo away from
deploying a box with no secrets.

### From CI

`.github/workflows/deploy.yml` SSHes in and runs it. Two keys are involved, in
opposite directions, which is the easy thing to get confused:

| Key | Private half lives | Direction |
|---|---|---|
| `~/.ssh/gh_projcert` | on the VM | VM pulls from GitHub (repo deploy key, read-only) |
| `DEPLOY_KEY` secret | in GitHub Actions | GitHub SSHes into the VM |

The CI key is pinned to a forced command in the VM's `authorized_keys`:

```
command="/home/azureuser/certacito/infra/scripts/deploy-vm.sh",no-agent-forwarding,no-port-forwarding,no-pty
```

Whatever the runner sends is ignored; the VM forces the deploy script. If that
secret leaked, the worst it can do is redeploy main.

Repo settings needed: secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, and
variable `AZURE_DEPLOY_ENABLED=true`. Flipping the variable to `false` stops
deploys without touching the workflow.

**Note:** GitHub scopes deploy keys globally, so the same public key cannot be
registered on two repositories. Moving the repo means minting a new pair on the VM.

## The governed agent

The OpenClaw gateway runs on the VM as a host process on port 18789, alongside the
containers. It is reached through Caddy on 443 rather than directly, because the
control UI refuses to run outside a secure context, so plain `http://<ip>:18789`
will never connect in a browser.

`/etc/caddy/Caddyfile`:

```
{
	http_port 8080          # port 80 belongs to the app; ACME uses tls-alpn on 443
}

https://20-92-93-30.nip.io {
	basic_auth { ... }
	reverse_proxy localhost:18789
}
```

`nip.io` is wildcard DNS that resolves the hostname straight back to the IP, which
gets a real Let's Encrypt certificate without owning a domain. **Basic auth sits in
front of it**, added because the site is reachable from the open internet and the
gateway's own token travels in a URL query string.

### Interception on the agent side

The agent is agy (Antigravity CLI) driven by OpenClaw, so OpenClaw's own
`shellCommandPrefix` is no use here: agy owns the tool loop and runs commands
itself. What works is agy's permission layer, which auto-denies any command
without a matching allow-rule. Allowing exactly one binary leaves the gate as the
only route to a shell.

`~/.agy-home/.gemini/antigravity-cli/settings.json`:

```json
{
  "permissions": { "allow": ["command(certacito-exec-gate)"] }
}
```

Checked both directions:

```
certacito-exec-gate echo hello-governed   -> PERMIT, ran, audit RULE-005
certacito-exec-gate curl .../patient/...  -> DENY,  blocked, audit RULE-001
cat /etc/passwd (raw, no gate)            -> auto-denied by agy, never ran
```

The last line is the one that matters. The agent cannot route around the gate; it
just loses the ability to run anything at all.

`CERTACITO_API_KEY` has to be in the agent's env (`/etc/certacito-agent.env`),
otherwise the hook fails closed and denies everything, which looks like a policy
bug but isn't.

## Post-deploy checklist

- `http://20.92.93.30/health` returns `{"status":"ok"}`
- log in, confirm the dashboard populates and the LIVE badge is green
- run the four demo prompts, confirm PERMIT / DENY / DENY / ESCALATE
- open the audit log and run **Verify chain**
- confirm the agent console prompts for basic auth

## TLS

`infra/caddy/Caddyfile` in the repo is the config for the host Caddy. It adds a
second vhost, `app.20-92-93-30.nip.io`, proxying to the app on localhost:80, so
the platform is reachable over HTTPS with a real certificate. Before this, port
80 was plain HTTP and every login POST and JWT crossed the internet in clear.

**Not applied yet** - it needs a shell on the box:

```bash
# the basic_auth hash for the agent console vhost is not in the repo, so copy
# the existing one across rather than pasting this file over the top blind
sudo cp infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

# then let the app trust the header Caddy sets, otherwise the rate limiter
# still counts every request against the proxy
echo 'TRUST_PROXY_HEADER=true' >> ~/certacito/.env
docker compose -f docker-compose.azure.yml up -d
```

Port 80 keeps serving so existing links do not break. Once nothing depends on
plain HTTP, bind the app publish to `127.0.0.1:80:8000` so Caddy is the only way
in, and raise the `Strict-Transport-Security` max-age.

## Known gaps and gotchas

- **The VM has a daily auto-shutdown** (01:00 AEST) to protect student credit. If
  the site is unreachable, check the VM is started before debugging anything else.
- Migrations: the app runs `init_db()` on startup; use Alembic against the VM's
  Postgres for schema changes after that.
- The rate limiter keeps its counters in Redis, which is already in the compose
  file. If Redis is unreachable it falls back to counting in-process and logs a
  warning - the limit still applies, just per-instance.
- `TRUST_PROXY_HEADER` defaults to false. Only turn it on when something in front
  of the app actually overwrites `X-Real-IP`; trusting it otherwise hands every
  caller a private rate limit bucket, `/auth/login` included.
- `TRUSTED_PROXIES` is the other half of that, and the flag is not safe without
  it. The flag says a proxy overwrites the header, which is only true of traffic
  that came through the proxy - and port 80 is still published straight out, so
  a caller can reach the app directly and set the header themselves. Only peers
  inside these ranges get believed. Caddy proxies from the Docker bridge, so the
  default private ranges cover it, and no internet-routed client can claim a
  source address inside them. Widen it and you reopen the bypass.
- The admin bootstrap only applies to the first registered account. Register is
  admin-only once any user exists.
