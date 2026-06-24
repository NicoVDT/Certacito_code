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
