from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

# Cria a engine assíncrona (com echo=True para ver as queries no terminal durante o dev)
engine = create_async_engine(
    settings.ASYNC_DATABASE_URI,
    echo=True,
    future=True
)

# Fábrica de sessões do banco
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Dependência para injetar a conexão nas rotas do FastAPI
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()