# Architecture Overview

## Backend
- **FastAPI**: Handles all API requests.
- **PostgreSQL**: Stores users, policies, and the audit log.
- **Policy Engine**: Evaluates intercepted prompts against the YAML rules.
- **Semantic Guard**: Checks for injection patterns using regex.
- **Audit Service**: Appends events to a SHA-256 hash chain to prevent tampering.

## Frontend
- **React 18 & Vite**: Single page application.
- **Tailwind CSS**: For styling components.
- **WebSockets**: Used for the live dashboard feed.

## Deployment
- Docker Compose is used for local development (Postgres + Redis).
- Production target is Azure App Service.
