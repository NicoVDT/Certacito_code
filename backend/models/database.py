from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from backend.config import settings


# echo=False because the sql spam in the logs was driving me nuts
engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    # dependency that hands out a session and closes it when done
    async with async_session() as session:
        yield session


async def init_db():
    # creates all the tables. we mainly use alembic for migrations but this is
    # handy for tests / first boot. TODO if we should drop this
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_policies_if_empty()


async def seed_policies_if_empty():
    """
    Put the yaml rules in the policy table on a fresh database.

    The engine reads policies.yaml, but the /policies screen reads the table,
    and nothing ever wrote one to the other. On a clean box that meant the UI
    listed no rules at all while the engine was busy enforcing them.
    """
    import yaml
    from sqlalchemy import select, func as sqlfunc
    from backend.config import settings
    from backend.models.tables import PolicyRuleDB

    async with async_session() as db:
        count = (await db.execute(select(sqlfunc.count(PolicyRuleDB.id)))).scalar() or 0
        if count:
            return

        try:
            with open(settings.policy_config_path) as f:
                data = yaml.safe_load(f) or {}
        except FileNotFoundError:
            return

        for r in data.get("rules", []):
            db.add(PolicyRuleDB(
                id=r["id"],
                name=r["name"],
                action_type=r["action_type"],
                risk_threshold=r["risk_threshold"],
                default_outcome=r["default_outcome"],
                conditions=r.get("conditions"),
                reg_tag=r.get("reg_tag", ""),
                active=r.get("active", True),
                version=r.get("version", 1),
                created_by="seed",
            ))
        await db.commit()
