"""
RAVENS async CRUD operations (SQLite + aiosqlite).
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select

from .models import Base, WasteDetection, DumpingIncident, TrajectoryPrediction
from backend.config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session


# --------------- WasteDetection ---------------

async def add_waste_detection(session: AsyncSession, **kwargs) -> WasteDetection:
    obj = WasteDetection(**kwargs)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def get_waste_detections(session: AsyncSession, limit: int = 100) -> list[WasteDetection]:
    result = await session.execute(
        select(WasteDetection).order_by(WasteDetection.timestamp.desc()).limit(limit)
    )
    return list(result.scalars().all())


# --------------- DumpingIncident ---------------

async def add_dumping_incident(session: AsyncSession, **kwargs) -> DumpingIncident:
    obj = DumpingIncident(**kwargs)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def get_dumping_incidents(session: AsyncSession, limit: int = 100) -> list[DumpingIncident]:
    result = await session.execute(
        select(DumpingIncident).order_by(DumpingIncident.timestamp.desc()).limit(limit)
    )
    return list(result.scalars().all())


# --------------- TrajectoryPrediction ---------------

async def add_trajectory_prediction(session: AsyncSession, **kwargs) -> TrajectoryPrediction:
    obj = TrajectoryPrediction(**kwargs)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def get_trajectory_predictions(session: AsyncSession, limit: int = 100) -> list[TrajectoryPrediction]:
    result = await session.execute(
        select(TrajectoryPrediction).order_by(TrajectoryPrediction.timestamp.desc()).limit(limit)
    )
    return list(result.scalars().all())


# --------------- Combined map data ---------------

async def get_all_map_data(session: AsyncSession) -> dict:
    waste = await get_waste_detections(session, limit=100)
    dumping = await get_dumping_incidents(session, limit=100)
    predictions = await get_trajectory_predictions(session, limit=100)
    return {
        "waste": waste,
        "dumping": dumping,
        "predictions": predictions,
    }
