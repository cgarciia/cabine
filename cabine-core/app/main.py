from datetime import timedelta
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse
from app.api.fhir_patient import router as fhir_patient_router

app = FastAPI(
    title="Cabine API",
    version="1.0.0",
    description="API do ecossistema Cabine com FastAPI e FHIR"
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- ROTAS DE STATUS ---

@app.get("/", tags=["Root"])
async def root():
    return {"message": "Cabine API está online!"}


@app.get("/health", tags=["Status"])
async def health_check():
    return {"status": "ok"}


# --- ROTAS DE USUÁRIO ---

@app.post("/users/", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["Users"])
async def register_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    """
    Cadastra um novo usuário no sistema.
    """
    result = await db.execute(select(User).where(User.email == user.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado.")

    hashed_pw = get_password_hash(user.password)

    db_user = User(email=user.email, hashed_password=hashed_pw)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return db_user


@app.post("/login", tags=["Auth"])
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    Autentica o usuário e retorna o token JWT.
    (No Swagger, use o campo 'username' para colocar o seu e-mail).
    """
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/users/me", response_model=UserResponse, tags=["Users"])
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Rota Protegida!
    Retorna os dados do usuário atualmente logado.
    """
    return current_user


# --- ROTAS FHIR ---
app.include_router(fhir_patient_router)