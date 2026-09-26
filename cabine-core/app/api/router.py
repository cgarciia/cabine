from fastapi import APIRouter

from app.api.routes import (
    auth,
    blood_pressure,
    fhir_patients,
    forms,
    health,
    measurements,
    oximeter,
    people,
    scale,
    users,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(fhir_patients.router)
api_router.include_router(people.router)
api_router.include_router(oximeter.router)

if settings.MVP_VERSION == 1:
    api_router.include_router(forms.router)
    api_router.include_router(scale.router)
    api_router.include_router(measurements.router)

if settings.MVP_VERSION == 2:
    api_router.include_router(blood_pressure.router)
