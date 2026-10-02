from fastapi import APIRouter

from app.api.routes import (
    admins,
    auth,
    blood_pressure,
    cabins,
    devices,
    forms,
    health,
    measurements,
    oximeter,
    scale,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(admins.router)
api_router.include_router(cabins.router)
api_router.include_router(users.router)
api_router.include_router(oximeter.router)
api_router.include_router(devices.router)
api_router.include_router(forms.router)
api_router.include_router(scale.router)
api_router.include_router(measurements.router)
api_router.include_router(blood_pressure.router)
