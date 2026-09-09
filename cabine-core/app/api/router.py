from fastapi import APIRouter

from app.api.routes import auth, fhir_patients, health, measurements, people, scale, users

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(fhir_patients.router)
api_router.include_router(scale.router)
api_router.include_router(people.router)
api_router.include_router(measurements.router)
