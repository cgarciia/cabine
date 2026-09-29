from app.core.database import AsyncSessionLocal
from app.crud import paired_device as paired_crud


async def resolve_paired_address(kind: str) -> str | None:
    """Active MAC for a clinical device, used when the measurement screen sends none."""
    async with AsyncSessionLocal() as db:
        row = await paired_crud.get_active(db, kind)
        if row is None:
            return None
        return row.address.strip().upper() or None
