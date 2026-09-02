from pydantic import BaseModel, ConfigDict
from uuid import UUID

# O que esperamos receber do Frontend quando o usuário se cadastrar
class UserCreate(BaseModel):
    email: str
    password: str

# O que vamos devolver para o Frontend (nunca devolvemos a senha!)
class UserResponse(BaseModel):
    id: UUID
    email: str
    is_active: bool

    # Permite que o Pydantic leia dados diretos do SQLAlchemy
    model_config = ConfigDict(from_attributes=True)