from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud import scale as scale_crud
from app.schemas.scale import (
    ScaleCatalogResponse,
    ScaleCreate,
    ScaleResponse,
    ScaleUpdate,
    catalog_payload,
)
from app.services.scale.stream import stream_scale

router = APIRouter(tags=["Scales"])


@router.get("/scales/catalog", response_model=ScaleCatalogResponse)
async def get_scale_catalog():
    return catalog_payload()


@router.get("/scales", response_model=list[ScaleResponse])
async def list_scales(db: AsyncSession = Depends(get_db)):
    return await scale_crud.list_all(db)


@router.post("/scales", response_model=ScaleResponse, status_code=status.HTTP_201_CREATED)
async def create_scale(payload: ScaleCreate, db: AsyncSession = Depends(get_db)):
    if await scale_crud.get_by_address(db, payload.address):
        raise HTTPException(status_code=400, detail="Já existe uma balança com este endereço.")
    try:
        return await scale_crud.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/scales/{scale_id}", response_model=ScaleResponse)
async def get_scale(scale_id: UUID, db: AsyncSession = Depends(get_db)):
    scale = await scale_crud.get_by_id(db, scale_id)
    if not scale:
        raise HTTPException(status_code=404, detail="Balança não encontrada.")
    return scale


@router.patch("/scales/{scale_id}", response_model=ScaleResponse)
async def update_scale(scale_id: UUID, payload: ScaleUpdate, db: AsyncSession = Depends(get_db)):
    scale = await scale_crud.get_by_id(db, scale_id)
    if not scale:
        raise HTTPException(status_code=404, detail="Balança não encontrada.")
    try:
        return await scale_crud.update_scale(db, scale, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/scales/{scale_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scale(scale_id: UUID, db: AsyncSession = Depends(get_db)):
    scale = await scale_crud.get_by_id(db, scale_id)
    if not scale:
        raise HTTPException(status_code=404, detail="Balança não encontrada.")
    await scale_crud.delete_scale(db, scale)


@router.websocket("/ws/scale")
async def scale_endpoint(
    websocket: WebSocket,
    scale_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    await stream_scale(websocket, db, scale_id)
