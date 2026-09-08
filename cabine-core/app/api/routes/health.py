from fastapi import APIRouter

router = APIRouter(tags=["Status"])


@router.get("/")
async def root():
    return {"message": "Cabine API está online!"}


@router.get("/health")
async def health_check():
    return {"status": "ok"}
