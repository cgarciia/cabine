from app.core.database import AsyncSessionLocal
from app.crud import device as device_crud


async def resolve_paired_address(kind: str) -> str | None:
    """Active default MAC for a clinical device, used when the measurement screen sends none."""
    async with AsyncSessionLocal() as db:
        row = await device_crud.get_default(db, kind)
        if row is None:
            return None
        return row.address.strip().upper() or None
