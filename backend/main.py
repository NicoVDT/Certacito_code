import asyncio
import os

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.database import get_db, init_db
from backend.services.rate_middleware import RateLimitMiddleware
from backend.services.scheduler import scheduler_loop
from backend.api.interception import router as interception_router
from backend.api.audit import router as audit_router
from backend.api.approval import router as approval_router
from backend.api.policy import router as policy_router
from backend.api.auth import router as auth_router
from backend.api.stats import router as stats_router
from backend.api.guardrails import router as guardrails_router
from backend.api.websocket import router as websocket_router
from backend.api.agents import router as agents_router
from backend.api.demo import router as demo_router
from backend.api.reports import router as reports_router
from backend.api.dryrun import router as dryrun_router
from backend.api.trends import router as trends_router
from backend.api.apikeys import router as apikeys_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    task = asyncio.create_task(scheduler_loop())
    yield
    task.cancel()


app = FastAPI(
    title="Certacito.ai Governance API",
    description="AI agent governance, compliance and audit platform",
    version="0.1.0",
    lifespan=lifespan,
)

# cors - open for dev, tighten later
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://100.122.76.39",
        "https://openclaw-103.tail28b3e2.ts.net",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 60/min general, 10/min auth
app.add_middleware(RateLimitMiddleware)

app.include_router(interception_router, prefix="/api/v1", tags=["interception"])
app.include_router(audit_router, prefix="/api/v1", tags=["audit"])
app.include_router(approval_router, prefix="/api/v1", tags=["approval"])
app.include_router(policy_router, prefix="/api/v1", tags=["policy"])
app.include_router(auth_router, prefix="/api/v1", tags=["auth"])
app.include_router(stats_router, prefix="/api/v1", tags=["stats"])
app.include_router(guardrails_router, prefix="/api/v1", tags=["guardrails"])
app.include_router(websocket_router, prefix="/api/v1", tags=["websocket"])
app.include_router(agents_router, prefix="/api/v1", tags=["agents"])
app.include_router(demo_router, prefix="/api/v1", tags=["demo"])
app.include_router(reports_router, prefix="/api/v1", tags=["reports"])
app.include_router(dryrun_router, prefix="/api/v1", tags=["dryrun"])
app.include_router(trends_router, prefix="/api/v1", tags=["trends"])
app.include_router(apikeys_router, prefix="/api/v1", tags=["apikeys"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "certacito-api"}


# single-app deploy on azure - baked frontend served from here so no nginx
# mounted last so /api/* and /health keep winning
if os.path.isdir("frontend_dist"):
    app.mount("/", StaticFiles(directory="frontend_dist", html=True), name="frontend")
