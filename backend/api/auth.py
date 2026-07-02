import hashlib
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from jose import jwt, JWTError
from passlib.context import CryptContext

from backend.models.database import get_db
from backend.models.tables import User, ApiKeyDB
from backend.models.schemas import UserCreate, Token, Role
from backend.config import settings

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# role shortcuts so the routers don't all repeat the same string lists
ADMIN_ONLY = ["Administrator"]
STAFF = ["Administrator", "Analyst"]
ALL_ROLES = ["Administrator", "Analyst", "Viewer"]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


async def _user_from_jwt(token: str, db: AsyncSession) -> Optional[User]:
    # shared decode + lookup, used by the http dep and the ws too
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("sub")
    except JWTError:
        return None
    if user_id is None:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await _user_from_jwt(token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(allowed_roles: list[str]):
    """checks the user has one of the allowed roles"""
    async def check(user: User = Depends(get_current_user)):
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return check


async def agent_or_user(request: Request, db: AsyncSession = Depends(get_db)):
    # auth for agent-facing endpoints (intercept, guardrails, risk).
    # agents can't do the oauth login dance so they send X-API-Key instead,
    # humans use their normal Bearer token. fail-closed if neither works.
    key = request.headers.get("X-API-Key")
    if key:
        if settings.agent_api_key and secrets.compare_digest(key, settings.agent_api_key):
            return {"kind": "agent"}
        # also accept keys issued from Settings > API Keys, not just the env one
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        result = await db.execute(select(ApiKeyDB).where(ApiKeyDB.key_hash == key_hash))
        issued = result.scalar_one_or_none()
        if issued and not issued.revoked:
            issued.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            return {"kind": "agent"}

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        user = await _user_from_jwt(auth_header.removeprefix("Bearer "), db)
        if user:
            return {"kind": "user", "user": user}

    raise HTTPException(status_code=401, detail="Valid API key or token required")


@router.post("/auth/register")
async def register(body: UserCreate, request: Request, db: AsyncSession = Depends(get_db)):
    # the very first account becomes the bootstrap admin. after that only
    # an admin can create users - otherwise anyone could just register
    # themselves as Administrator which defeats the whole point of RBAC
    count_result = await db.execute(select(func.count(User.id)))
    user_count = count_result.scalar() or 0

    if user_count > 0:
        auth_header = request.headers.get("Authorization", "")
        caller = None
        if auth_header.startswith("Bearer "):
            caller = await _user_from_jwt(auth_header.removeprefix("Bearer "), db)
        if caller is None:
            raise HTTPException(status_code=401, detail="Admin token required to create users")
        if caller.role != "Administrator":
            raise HTTPException(status_code=403, detail="Only administrators can create users")

    # check wether email taken
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # first account has to be admin whatever role they asked for - otherwise
    # whoever follows the readme ends up a Viewer and then nobody can make
    # users at all since register needs an admin once one exists
    role = "Administrator" if user_count == 0 else body.role.value
    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        hashed_password=hash_password(body.password),
        role=role,
    )
    db.add(user)
    await db.commit()
    # print(f"[debug] registered user {body.email} as {role}")
    return {"status": "registered", "email": body.email, "role": role}


@router.post("/auth/login", response_model=Token)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Bad credentials")

    token = create_token({"sub": user.id, "role": user.role})
    return Token(access_token=token)


@router.get("/auth/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role}


@router.get("/auth/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(ADMIN_ONLY)),
):
    """list all users (admin only)"""
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]
