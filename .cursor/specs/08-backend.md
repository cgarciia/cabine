# 08 — Backend (`cabine-core`)

Pacote Python `app` (FastAPI). Mapa de pastas, camadas e o que **não** deve entrar no core. O frontend fala com este processo via HTTP e WebSocket.

## 1. Papel do core

- autenticação JWT (admin do painel e usuário do totem);
- cadastro de **usuários** do totem (matrícula, altura, sexo);
- cabines, aparelhos, sessões de exame identificado;
- questionários (`health` | `mental`);
- balanças BLE (peso + BIA), oxímetro BLE, monitores de pressão HEM-7530T e HEM-6161T2;
- persistência em Postgres.

Não é SPA, não calcula tela, não guarda sessão de kiosk. Isso é o `cabine-web`.

O core não escolhe MVP: `api/router.py` registra tudo no mesmo processo (`:8000`). Não criar segundo uvicorn: o rádio BLE é um só.

## 2. Árvore

```
cabine-core/
  app/
    main.py                 # create_app(), CORS, lifespan (dispose do engine)
    api/
      router.py             # include_router de cada módulo
      routes/               # endpoints finos (sem Bleak, sem SQL cru)
    core/                   # config, database, security, deps, rate_limit
    models/                 # SQLAlchemy; exportar em models/__init__.py
    schemas/                # Pydantic Create / Update / Response
    crud/                   # persistência async; commit/refresh aqui
    services/               # domínio, BLE, parsers, persistência de leitura
      ble/ scale/ oximeter/ blood_pressure/ devices/
      cabin_state.py        # cabin.json (machine_id + cabin_id)
  alembic/versions/         # revisions (schema em inglês)
  docker-compose.yml        # Postgres 16 local
  Makefile                  # db-up, db-down, db-reset, run, dev, makemigrations, migrate
  pyproject.toml + uv.lock  # fonte da verdade das deps (uv, não pip)
  .env.example              # template; .env não vai para o git
  scripts/                  # sondas de laboratório; NÃO sobem no servidor
```

Fluxo obrigatório:

```
rota HTTP/WS → schema Pydantic → crud e/ou services
```

Rotas não montam `select()`. CRUD não importa FastAPI **nem `services`** (exceção hoje: `crud/cabin.py` usa `services/cabin_state`; não ampliar). Rotas não falam com Bleak. Rota não importa rota (`as_measurement_response` vive em `schemas/measurement.py`).

## 3. Camadas

### `app/main.py`

Factory `create_app()`. CORS vem de `settings`. No shutdown, `engine.dispose()`. Não existe `python main.py` na raiz; subir com `make run`.

### `app/core`

| Arquivo | Função |
|---|---|
| `config.py` | `pydantic-settings`, `.env`, `case_sensitive=True`, URI asyncpg |
| `database.py` | engine async, `AsyncSessionLocal`, `get_db` |
| `security.py` | bcrypt + JWT HS256; único lugar que emite token |
| `rate_limit.py` | limite de **falhas** de login em memória (IP e matrícula/e-mail) → 429 |
| `deps.py` | `get_current_user` (admin), `require_access`, `get_scoped_user` / `load_scoped_user`, WS `authenticate_websocket` |

### `app/api/routes`

Um arquivo por recurso; `router.py` só agrega. Superfície completa em `05-api.md`.

| Arquivo | Superfície |
|---|---|
| `health.py` | `/`, `/health` |
| `cabins.py` | `/cabins/*` |
| `auth.py` | `/login`, `/login/registration`, `/login/lookup` |
| `admins.py` | `/admins`, `/admins/me` |
| `users.py` | CRUD do totem + única listagem dos filhos `/users/{id}/*` |
| `forms.py` / `measurements.py` | `POST /forms`, `POST /measurements` |
| `scale.py` | `/scales*` + `WS /ws/scale` |
| `oximeter.py` | scan, `POST /oximeters`, `WS /ws/oximeter` |
| `blood_pressure.py` | scan, `POST /blood-pressures`, `WS /ws/blood-pressure`, `WS /ws/blood-pressure-wrist` |
| `devices.py` | `/devices`, `/devices/scan`, `/devices/pair` (router inteiro exige admin) |

### `app/models`

Todos herdam `Base`. Registrar em `models/__init__.py`. Tabelas: `04-modelagem-dados.md`.

### `app/schemas`

Contrato HTTP: `*Create`, `*Update`, `*Response`. Validação de adapter/parser de balança em `schemas/scale.py` (chama o registry). `as_measurement_response` enriquece métricas na resposta.

### `app/crud`

Funções async: `list_all`, `get_by_id`, `create`, `update_*`, `delete_*` (e `list_by_user`, `get_by_email`, …). `crud/base.py`: `save`, `create_from_schema`, `list_by_user`. **Commit e refresh aqui.**

### `app/services`

I/O e domínio que não é "só SQL": BLE, parsers, persistência de leitura, pareamento, estado da cabine. Detalhe em `07-hardware-ble.md`.

## 4. Nomenclatura

| Coisa | Padrão |
|---|---|
| Arquivo Python | `snake_case` |
| Classe model/schema | `PascalCase` |
| Tabela | plural `snake_case` |
| Função | `snake_case` |
| Schema HTTP | `UserCreate`, `UserResponse`, `AdminCreate` |
| Identificadores | inglês (`list_users`, não `listar_usuarios`) |
| `HTTPException.detail` | português |

## 5. Como acrescentar um recurso REST

1. Model em `app/models/` + export no `__init__.py`.
2. Migration Alembic.
3. Schema `Create` / `Response`.
4. CRUD async.
5. Rota fina + `include_router` em `api/router.py`.
6. Path novo → proxy correspondente em `cabine-web/vite.config.ts`.
7. Tipo em `cabine-web/src/types/` e função em `api.ts` (se o front usa).
8. Atualizar `04-modelagem-dados.md` / `05-api.md`.

## 6. Nunca fazer neste pacote

- Lógica BLE dentro de `api/routes`.
- Query SQLAlchemy na rota.
- SQLAlchemy síncrono / `psycopg2` no caminho da API.
- Segundo gerenciador de deps (pip freeze, poetry.lock) como fonte da verdade.
- Secrets commitados.
- Log de debug de sessão BLE em `app/`.
- MAC de hardware de laboratório como default de config.
- Pasta de UI, store global, ou cálculo de tela de kiosk.
- PK inteira autoincrement; timestamps manuais no lugar de `Base`.
- Rota FHIR, `GET /measurements?user_id=`, ou listagem de filhos fora de `/users/{id}/*`.

## 7. Testes

Ainda **não há** `cabine-core/tests/`. Quando existir: pytest async, em `cabine-core/tests/`, espelhando `app/` (`tests/crud`, `tests/services`, `tests/api`); parsers e regras puras (ex.: `scale/parsers.py`, `wla25.py`, `rate_limit.py`, `cabin_state.py`) são os primeiros candidatos por não precisarem de hardware nem de banco.
