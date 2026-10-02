from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import cabin as cabin_crud
from app.models.admin import Admin
from app.schemas.cabin import CabinName, CabinResponse

router = APIRouter(prefix="/cabins", tags=["Cabins"])

_NOT_REGISTERED = "Esta cabine ainda não foi cadastrada."


@router.get("/current", response_model=CabinResponse)
async def current_cabin(db: AsyncSession = Depends(get_db)):
    cabin = await cabin_crud.get_local(db)
    if cabin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_REGISTERED)
    return cabin


@router.post("/register", response_model=CabinResponse, status_code=status.HTTP_201_CREATED)
async def register_cabin(payload: CabinName, db: AsyncSession = Depends(get_db)):
    try:
        return await cabin_crud.register(db, payload.description)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/current", response_model=CabinResponse)
async def rename_cabin(
    payload: CabinName,
    db: AsyncSession = Depends(get_db),
    _: Admin = Depends(get_current_user),
):
    try:
        return await cabin_crud.rename(db, payload.description)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
