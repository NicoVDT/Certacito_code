# Azure Deployment Runbook (FR-07)

How the staging system moves to Azure. Written so any group member can execute it
once the Azure subscription (GitHub Student Pack credit) is active.

## Target shape

- **One Azure Web App for Containers** running `infra/docker/Dockerfile.azure`
  (FastAPI serves the built frontend, so no second app and no nginx).
- **Azure Database for PostgreSQL Flexible Server** (burstable B1ms is plenty).
- **GitHub Actions** builds the image to GHCR and deploys on every push to main
  (`.github/workflows/deploy.yml`, gated behind the `AZURE_DEPLOY_ENABLED` var).
- **Custom domain** + App Service managed certificate (TLS).
- **Key Vault** holds `SECRET_KEY`, `AGENT_API_KEY`, DB password; the web app
  reads them via Key Vault references so nothing secret sits in app settings.

## One-time setup (az cli)

```bash
az login
az group create -n certacito-rg -l australiaeast

# postgres
az postgres flexible-server create -g certacito-rg -n certacito-db \
  --sku-name Standard_B1ms --tier Burstable --version 16 \
  --admin-user certacito --admin-password '<generate>' \
  --public-access 0.0.0.0   # azure-services-only access

# key vault
az keyvault create -g certacito-rg -n certacito-kv
az keyvault secret set --vault-name certacito-kv -n secret-key --value '<generate>'
az keyvault secret set --vault-name certacito-kv -n agent-api-key --value '<generate>'
az keyvault secret set --vault-name certacito-kv -n db-password --value '<same as above>'

# web app (container)
az appservice plan create -g certacito-rg -n certacito-plan --is-linux --sku B1
az webapp create -g certacito-rg -p certacito-plan -n certacito-app \
  --deployment-container-image-name ghcr.io/<owner>/certacito:latest
az webapp identity assign -g certacito-rg -n certacito-app
az keyvault set-policy -n certacito-kv --secret-permissions get list \
  --object-id <principal id from previous command>

az webapp config appsettings set -g certacito-rg -n certacito-app --settings \
  DATABASE_URL='postgresql+asyncpg://certacito:@Microsoft.KeyVault(SecretUri=...)@certacito-db.postgres.database.azure.com:5432/certacito' \
  SECRET_KEY='@Microsoft.KeyVault(SecretUri=https://certacito-kv.vault.azure.net/secrets/secret-key/)' \
  AGENT_API_KEY='@Microsoft.KeyVault(SecretUri=https://certacito-kv.vault.azure.net/secrets/agent-api-key/)' \
  WEBSITES_PORT=8000
```

## Wire up CI deploy

1. Repo Settings -> Secrets and variables -> Actions:
   - secret `AZURE_WEBAPP_NAME` = `certacito-app`
   - secret `AZURE_WEBAPP_PUBLISH_PROFILE` = contents of the publish profile
     (Web App overview -> Get publish profile)
   - variable `AZURE_DEPLOY_ENABLED` = `true`
2. Push to main. The workflow builds `Dockerfile.azure`, pushes to GHCR and
   deploys the sha-tagged image.

## Domain + TLS

```bash
az webapp config hostname add -g certacito-rg --webapp-name certacito-app \
  --hostname app.<our-domain>
# then: App Service -> Custom domains -> Add managed certificate (free) -> bind
```

DNS at the registrar: CNAME `app` -> `certacito-app.azurewebsites.net` plus the
TXT verification record Azure shows.

## Post-deploy checklist

- `https://app.<domain>/health` returns ok
- first visit bootstraps the admin account (register is open only for user #1)
- run the healthcare demo scenario, confirm audit entries + verify chain
- hooks live at /usr/local/bin/certacito-{hook,exec-gate} on the vm, key in /etc/certacito-agent.env
- lock the staging box back to tailnet-only

## Agent interception on the vm

The agent is agy (antigravity CLI) driven by openclaw, so openclaw's own
`shellCommandPrefix` is no use here - agy owns the tool loop and runs commands
itself. What does work is agy's permission layer: it auto-denies any command
without a matching allow-rule, so allowing exactly one binary leaves the gate
as the only route to a shell.

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

The last line is the one that matters - the agent cannot route around the gate,
it just loses the ability to run anything at all.

`CERTACITO_API_KEY` has to be in the agent's env (`/etc/certacito-agent.env`),
otherwise the hook fails closed and denies everything, which looks like a
policy bug but isn't.

## Notes

- The websocket path `/api/v1/ws/live` works on App Service out of the box
  (web sockets toggle is on by default for Linux containers; verify under
  Configuration -> General settings if the LIVE badge stays grey).
- Migrations: the app runs `init_db()` on startup; Alembic against the Azure DB
  for schema changes after that.
- Rate limiter is in-memory per instance - fine on one B1 instance, revisit
  before scaling out.
