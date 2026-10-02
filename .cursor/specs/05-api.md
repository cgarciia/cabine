# 05 — API

FastAPI em `:8000`. Sem versionamento de path. Swagger/OpenAPI gerado em runtime (`/docs`, `/openapi.json`); `openapi.json` **não** é versionado.

## 1. Convenções do contrato

- JSON em **snake_case**. Paths em inglês, sem barra final.
- `detail` de erro em **português**.
- Schemas Pydantic: `*Create`, `*Update`, `*Response` (`ConfigDict(from_attributes=True)` no Response).
- IDs: `UUID` no FastAPI; string UUID no front.
- Listagem por usuário só em `/users/{id}/*`. Não recriar `GET /measurements?user_id=` nem `/forms/user/{id}`.
- Rota que recebe `user_id` usa `get_scoped_user` (path) ou `load_scoped_user` (body) para escopo + 404.
- Erros: `HTTPException` com `detail`. Códigos usados: 400, 401, 403, 404, 409, 422, 429 (+ `Retry-After`).
- Criação responde `201`; exclusão `204`.
- Recurso novo: ver checklist em `08-backend.md` §9 e a rule `../rules/02-backend-python.mdc`.

## 2. Superfície

Legenda de acesso: **Público**, **Pessoa** (`typ=person`), **Admin** (`typ=user`), **Pessoa/Admin** (a própria pessoa ou admin).

### Saúde e cabine

| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| GET | `/` | Público | `{"message":"Cabine API está online!"}` |
| GET | `/health` | Público | `{"status":"ok"}` |
| GET | `/cabins/current` | Público | Cabine deste PC; `404` se não cadastrada |
| POST | `/cabins/register` | Público | Cadastra/adota a cabine deste PC; `409` se já cadastrada |
| PATCH | `/cabins/current` | Admin | Renomeia a cabine |

### Autenticação

| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| POST | `/login` | Público (rate limit) | Admin: e-mail/senha (form OAuth2) → JWT `typ=user` |
| POST | `/login/registration` | Público (rate limit) | Totem: `{ registration, birth_date }` → JWT `typ=person` + usuário + `session_id` |
| POST | `/login/lookup` | Público (rate limit) | Matrícula existe? → `{ exists }` |
| POST | `/admins` | Público **só se não houver admin**; depois Admin | Cria admin |
| GET | `/admins/me` | Admin | Admin atual |

### Usuários do totem

| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| POST | `/users` | Público | Cadastro do totem (matrícula + nascimento) |
| GET | `/users` | Admin | Lista |
| PATCH | `/users/{id}` | Pessoa/Admin | Edita |
| DELETE | `/users/{id}` | Admin | Exclui (recusado se há histórico) |
| GET | `/users/{id}/forms` · `/measurements` · `/oximeter` · `/blood-pressure` | Pessoa/Admin | Histórico por tipo |

### Leituras

| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| POST | `/forms` | Pessoa/Admin | Questionário (`module` = `health` ou `mental`) |
| POST | `/measurements` | Pessoa/Admin | Peso/BIA |
| POST | `/oximeters` | Pessoa/Admin | Oximetria |
| POST | `/blood-pressures` | Pessoa/Admin | Pressão. `device_slug`: `blood_pressure_ecg` (padrão) ou `blood_pressure_wrist`. O aparelho sai de `device_id` ou do endereço; o slug só entra quando nenhum dos dois identifica o aparelho |

### Aparelhos e balanças

| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| GET | `/devices` | Admin | Inventário da cabine deste PC |
| POST | `/devices/scan` | Admin | `{ kind }` → procura aparelhos BLE (timeout longo, 30 s no front) |
| POST | `/devices/pair` | Admin | Pareia e define padrão |
| GET | `/scales`, `/scales/catalog`, `/scales/{id}` | Pessoa (sessão kiosk) ou Admin | Lista da cabine deste PC e catálogo de adapters |
| POST/PATCH/DELETE | `/scales`, `/scales/{id}` | Admin | CRUD de balança |
| GET | `/oximeters/scan`, `/blood-pressures/scan`, `/blood-pressures/wrist/scan` | Admin | Scan BLE (braço e pulso são rotas diferentes) |

### WebSocket (token na query `?token=`)

| Rota | Aparelho |
|---|---|
| `/ws/scale` | Balança |
| `/ws/oximeter` | Oxímetro |
| `/ws/blood-pressure` | HEM-7530T |
| `/ws/blood-pressure-wrist` | HEM-6161T2 |

Com token de pessoa, o `user_id` da sessão é o `sub`: o cliente não troca de usuário no meio do stream. Mensagens JSON (ex.: `STATUS`, `PESO_RECEBIDO` na balança). WS de balança carrega a balança e **libera a sessão do banco antes** do stream BLE longo.

## 3. Proxy do Vite

Todo path HTTP novo precisa de entrada no `proxy` de `cabine-web/vite.config.ts` (HTTP e WS → `:8000`). Em produção, `VITE_API_URL` aponta para a API.

## 4. CORS

`allow_credentials=False` (token vai no header, não em cookie). Origens de dev e rede privada (regex em `Settings`). Detalhe em `06-autenticacao-seguranca.md`.

## 5. Regras

- Rota fina: valida, chama `crud`/`services`, devolve schema. Sem SQL, sem Bleak.
- Mudou rota ou schema → atualizar esta spec, `src/types/`, `src/api.ts` e o proxy.
- Não expor rota de aparelho/scan a token de pessoa.
- Não criar rotas FHIR (saíram do contrato).
- Segundo cliente para a mesma rota no front é proibido (ver `09-frontend.md`).
