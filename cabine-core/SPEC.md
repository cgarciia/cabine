# SPEC — cabine-core

Documento de organização do backend da Cabine. Use este arquivo como mapa: o que vive em cada pasta, o que a API faz, e o que **não** deve entrar no core.

O pacote Python é `app` (FastAPI). O frontend fica em `cabine-web` e fala com este processo via HTTP e WebSocket.

## 1. Papel do core

O `cabine-core` é a API e o hardware da cabine:

- autenticação JWT (login de usuário do sistema);
- cadastro de **pessoas** (paciente da sessão, não o recurso FHIR);
- questionários (`health` | `mental`);
- balanças BLE (peso + BIA quando o adapter suportar);
- oxímetro BLE (SpO2 / pulso);
- persistência em Postgres;
- endpoint FHIR Patient (recurso clínico separado de `people`).

Não é SPA, não calcula tela, não guarda sessão de kiosk. Isso é `cabine-web`.

## 2. Árvore (padrão)

```
cabine-core/
  app/
    main.py                 # create_app(), CORS, lifespan (dispose do engine)
    api/
      router.py             # include_router de cada módulo
      routes/               # endpoints finos (sem Bleak, sem SQL cru)
    core/                   # config, database, security, deps
    models/                 # SQLAlchemy; exportar em models/__init__.py
    schemas/                # Pydantic Create / Update / Response
    crud/                   # persistência async; commit/refresh aqui
    services/               # domínio, BLE, parsers, FHIR, persistência de leitura
      ble/                  # rádio compartilhado (todas as periféricas)
      scale/                # só balança
      oximeter/             # só oxímetro
      fhir.py               # único lugar que importa fhir.resources
  alembic/                  # migrations async
  scripts/                  # probes e engenharia reversa; não são a API
  docker-compose.yml        # Postgres 16 local
  Makefile                  # db-up, run, migrate
  pyproject.toml + uv.lock  # fonte da verdade das deps (uv, não pip)
  .env.example              # template; .env não vai para o git
  SPEC.md                   # este arquivo
```

Fluxo obrigatório:

```
rota HTTP/WS → schema Pydantic → crud e/ou services
```

Rotas não montam `select()`. CRUD não importa FastAPI. Rotas não falam com Bleak.

## 3. O que foi organizado nesta revisão

| Antes | Agora | Por quê |
|---|---|---|
| `services/scale/adapters/ble_common.py` e `ble_winrt_patch.py` | `services/ble/common.py` e `services/ble/winrt_patch.py` | Oxímetro e balança compartilham o mesmo rádio Windows. Código de rádio não pertence à pasta da balança. |
| `models/patient.py` | `models/fhir_patient.py` | O arquivo batia com o CRUD `fhir_patient.py`. `people` é outro modelo (`ScalePerson`). |
| `as_measurement_response` em `routes/measurements.py` importado por `people.py` | `schemas/measurement.py` | Rota não importa rota. |
| `services/*/debuglog.py` | removidos (já estavam fora do fluxo) | Log de sessão BLE não entra no pacote da API. |

**Mantidos de propósito**

- `scripts/probe_scale.py`, `scripts/oximeter_probe.py` — sonda de hardware, fora da API.
- `scripts/parse_btsnoop_icomon.py` e `scripts/pull_relaxfit_snoop.ps1` — captura HCI / RelaxFit; não sobem no servidor.
- `services/scale/wla25.py` — cálculo de composição (usado por `metrics.py`).
- `services/scale/spec.py` — dataclass `ScaleSpec` (config da balança em memória). Não confundir com este `SPEC.md`.
- `models/fhir_patient.py` + rotas `/fhir/Patient` — FHIR continua; só o nome do arquivo alinhou.

Não há pasta `tests/` ainda. Quando existir, fica em `cabine-core/tests/` com pytest async, sem depender de `scripts/`.

## 4. Camadas

### `app/main.py`

Factory `create_app()`. CORS vem de `settings`. No shutdown, `engine.dispose()`.

Subir o servidor:

```bash
make run
# uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Não existe `python main.py` na raiz.

### `app/core`

| Arquivo | Função |
|---|---|
| `config.py` | `pydantic-settings`, `.env`, `case_sensitive=True`, URI asyncpg |
| `database.py` | engine async, `AsyncSessionLocal`, `get_db` |
| `security.py` | bcrypt + JWT HS256 |
| `deps.py` | `get_current_user` (OAuth2 password, `tokenUrl=login`) |

### `app/api/routes`

Um arquivo por recurso. `router.py` só agrega.

| Arquivo | Superfície |
|---|---|
| `health.py` | `GET /`, `GET /health` |
| `auth.py` | `POST /login` |
| `users.py` | `POST /users/`, `GET /users/me` |
| `people.py` | CRUD pessoas + filhos (`/forms`, `/measurements`, `/oximeter`) |
| `forms.py` | `POST /forms`, listagem por pessoa |
| `measurements.py` | pesagens REST |
| `scale.py` | CRUD `/scales` + catálogo + `WS /ws/scale` |
| `oximeter.py` | scan, REST, `WS /ws/oximeter` |
| `fhir_patients.py` | `POST/GET /fhir/Patient` (auth obrigatória) |

JSON da API: **snake_case**. `detail` de erro: **português**. Paths REST: **inglês**.

### `app/models`

Todos herdam `Base` (`UUID` + `created_at` / `updated_at`). Registrar em `models/__init__.py` para o Alembic ver metadata.

| Arquivo | Tabela | Classe |
|---|---|---|
| `user.py` | `users` | `User` |
| `person.py` | `people` | `ScalePerson` |
| `scale.py` | `scales` | `Scale` |
| `measurement.py` | `scale_measurements` | `ScaleMeasurement` |
| `oximeter_reading.py` | `oximeter_readings` | `OximeterReading` |
| `form_submission.py` | `form_submissions` | `FormSubmission` |
| `fhir_patient.py` | `fhir_patients` | `FHIRPatient` |

`people` é o paciente da cabine (matrícula, altura, sexo). `fhir_patients` é o recurso FHIR R4 persistido em JSONB. Não misturar.

### `app/schemas`

Contrato HTTP: `*Create`, `*Update`, `*Response`. Response usa `ConfigDict(from_attributes=True)`.

Validação de adapter/parser de balança vive em `schemas/scale.py` (chama o registry). Enriquecimento de métricas na resposta: `as_measurement_response`.

### `app/crud`

Funções async: `list_all`, `get_by_id`, `create`, `update_*`, `delete_*` (e variantes `list_by_person`, `get_by_email`, …). Commit e refresh aqui.

### `app/services`

I/O e domínio que não é “só SQL”.

## 5. Hardware BLE

Dois dispositivos, **um rádio**. No Windows, scan/connect simultâneos geram erro de rádio: tudo passa por `ble_radio_lock`.

```
services/ble/          # compartilhado
  common.py            # lock, MAC, watch_websocket_closed
  winrt_patch.py       # descritores GATT quebrados no WinRT

services/scale/        # só balança
  adapters/            # ble_gatt, ble_broadcast, ble_icomon
  registry.py          # chave do adapter → implementação
  parsers.py           # bytes → ScaleReading
  stream.py            # WebSocket da pesagem
  persist.py           # grava ScaleMeasurement
  metrics.py + wla25.py + icomon.py + reading.py

services/oximeter/     # só oxímetro (Creative PC-60 e similares)
  ble.py               # scan + GATT
  parsers.py
  stream.py
  persist.py
```

**Nova balança:** adapter em `services/scale/adapters/`, registrar em `registry.py`, parser em `parsers.py`, enum em `schemas/scale.py`. Rota não muda.

**Novo oxímetro:** parser/hints em `services/oximeter/`, não dentro de `scale/`.

**Novo tipo de periférico BLE:** reutilizar `services/ble/`; pasta própria em `services/<dispositivo>/`.

Scripts de laboratório:

```bash
uv run python scripts/probe_scale.py AA:BB:CC:DD:EE:FF
uv run python scripts/oximeter_probe.py
# HCI RelaxFit (PowerShell + adb): scripts/pull_relaxfit_snoop.ps1
uv run python scripts/parse_btsnoop_icomon.py CAMINHO\btsnoop_hci.log
```

## 6. Banco e migrations

Postgres 16 (`docker-compose.yml`). Engine: `postgresql+asyncpg`.

```bash
make db-up
make migrate
make makemigrations m="slug_da_mudanca"
```

Toda mudança de schema vira revision em `alembic/versions/`. Não alterar só o model.

`alembic/env.py` importa `from app.models import Base` — por isso todo model novo precisa estar no `__init__.py`.

## 7. Auth e FHIR

- **Kiosk (produção):** `POST /login/matricula` com `{ "matricula": "..." }` → JWT + pessoa.
- JWT HS256, validade padrão **24 horas** (`ACCESS_TOKEN_EXPIRE_MINUTES=1440`). Payload: `sub` = UUID da pessoa, `typ` = `"person"`, `matricula`.
- Sem sessão válida, a SPA redireciona para `/matricula` (não há login por e-mail no totem).
- Público: `GET /`, `GET /health`, `POST /login/matricula`, `POST /people` (primeiro cadastro), `POST /users/` (operador sistema).
- Demais HTTP: Bearer. WebSocket: query `token=`.
- `POST /login` (e-mail/senha) permanece só para operador do sistema / FHIR (`typ` = `"user"`), não é o fluxo do chão de fábrica.
- Front: token em `cabine.token` + `cabine.token-expires-at`.

Pessoa da cabine (`/people`) **não** substitui `/fhir/Patient`. FHIR: parse/dump só em `services/fhir.py`.

## 8. Nomenclatura

| Coisa | Padrão |
|---|---|
| Arquivo Python | snake_case |
| Classe model/schema | PascalCase |
| Tabela | plural snake_case |
| Função | snake_case |
| Schema HTTP | `PersonCreate`, `PersonResponse` |
| Identificadores | inglês (`list_people`, não `listar_pessoas`) |
| Texto de `HTTPException.detail` | português |

IDs: `UUID` no FastAPI; string UUID no front.

## 9. Como acrescentar um recurso REST

1. Model em `app/models/` + export no `__init__.py`.
2. Migration Alembic.
3. Schema `Create` / `Response`.
4. CRUD async.
5. Rota fina + `include_router` em `api/router.py`.
6. Se o path for novo, proxy correspondente em `cabine-web/vite.config.ts`.

## 10. Nunca fazer neste pacote

- Lógica BLE ou FHIR dentro de `api/routes`.
- Query SQLAlchemy na rota.
- SQLAlchemy síncrono / `psycopg2` no caminho da API.
- Segundo gerenciador de deps (pip freeze, poetry.lock) como fonte da verdade.
- Secrets commitados.
- Log de debug de sessão BLE no `app/`.
- Pasta de UI, store global, ou cálculo de tela de kiosk.
- PK inteiro autoincrement; timestamps manuais no lugar de `Base`.

## 11. Comandos locais

```bash
cd cabine-core
cp .env.example .env   # ajustar SECRET_KEY e Postgres
uv sync
make db-up
make migrate
make run
```

Health check: `GET http://127.0.0.1:8000/health` → `{"status":"ok"}`.
