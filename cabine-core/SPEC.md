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
- monitor de pressão HEM-7530T (PA via BLE; ECG ultrassônico opcional no front);
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
      scale/                # só balança (RM-RD2504A e adapters genéricos)
      oximeter/             # só oxímetro (PC-60NW)
      blood_pressure/       # monitor HEM-7530T
      fhir.py               # único lugar que importa fhir.resources
  alembic/                  # uma revision inicial (schema em inglês)
  docker-compose.yml        # Postgres 16 local
  Makefile                  # db-up, db-reset, run, migrate
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

**Hardware no produto (identificado pelo modelo)**

- Balança BIA: **RM-RD2504A** — adapter `ble_rm_rd2504a`, parser `rm_rd2504a_ffb2`, pasta `services/scale/rm_rd2504a.py`.
- Oxímetro: **PC-60NW** — `services/oximeter/`.
- Pressão: **HEM-7530T** — `services/blood_pressure/`. MAC só na query do WebSocket / `localStorage` (`cabine.bp-address`), nunca em `.env`.

`services/scale/wla25.py` — cálculo de composição (usado por `metrics.py`).
`services/scale/spec.py` — dataclass `ScaleSpec` (config da balança em memória; `ScaleSpec.from_record`). Não confundir com este `SPEC.md`.
`services/scale/measurement.py` — `sanitize_measurement` (descarta BIA de balança só-peso). Validação adapter/parser/endereço: `registry.resolve_transport`.
`crud/base.py` — `save`, `create_from_schema`, `list_by_person`. CRUD não importa `services`.
`models/fhir_patient.py` + rotas `/fhir/Patient` — FHIR continua.

Não há pasta `tests/` ainda. Quando existir, fica em `cabine-core/tests/` com pytest async.

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
| `security.py` | bcrypt + JWT HS256; `issue_person_token` / `issue_operator_token` (único lugar que emite token) |
| `rate_limit.py` | limite de **falhas** de login em memória (por IP e por matrícula/e-mail) → 429 |
| `deps.py` | `get_current_user`, `require_access`, `get_scoped_person` / `load_scoped_person` (escopo + 404), WS `authenticate_websocket` |

### `app/api/routes`

Um arquivo por recurso. `router.py` só agrega.

| Arquivo | Superfície |
|---|---|
| `health.py` | `GET /`, `GET /health` |
| `auth.py` | `POST /login` (operador), `POST /login/matricula` (totem + `birth_date`), `POST /login/lookup` |
| `users.py` | `POST /users` (primeiro usuário sem auth; depois só operador), `GET /users/me` |
| `people.py` | CRUD pessoas + **única** listagem dos filhos: `GET /people/{id}/forms`, `/measurements`, `/oximeter`, `/blood-pressure` |
| `forms.py` | `POST /forms` |
| `measurements.py` | `POST /measurements` |
| `scale.py` | GET catálogo/lista `/scales` (sessão kiosk ou operador); POST/PATCH/DELETE só operador; `WS /ws/scale` |
| `oximeter.py` | `GET /oximeters/scan` (só operador), `POST /oximeters`, `WS /ws/oximeter` |
| `blood_pressure.py` | `GET /blood-pressures/scan` (só operador), `POST /blood-pressures`, `WS /ws/blood-pressure` |
| `fhir_patients.py` | `POST /fhir/Patient`, `GET /fhir/Patient/{id}` (só operador) |

Listagem por pessoa fica só em `/people/{id}/*`. Não recriar `GET /measurements?person_id=` ou `/forms/person/{id}`.
Paths sem barra final. Rota que recebe `person_id` usa `get_scoped_person` (path) ou `load_scoped_person` (body).

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
| `blood_pressure_reading.py` | `blood_pressure_readings` | `BloodPressureReading` |
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

Três tipos de periférico, **um rádio**. No Windows, scan/connect simultâneos geram erro de rádio: tudo passa por `ble_radio_lock`.

```
services/ble/          # compartilhado (o patch WinRT é aplicado uma vez no import do pacote)
  common.py            # lock, MAC, watch_websocket_closed
  ids.py               # parse_uuid
  winrt_patch.py       # descritores GATT quebrados no WinRT
  scanner.py           # scan_devices, wait_for_device (espera o periférico acordar), as_ble_devices
  connect.py           # connect_with_fallback: tentativas WinRT cached/uncached, pareamento opcional
  ws_session.py        # DeviceWsSession (pessoa/visita, STATUS, tasks de persistência), consume_queue, cancel_and_wait

schemas/ble.py         # BleDevice/BleScanResponse (scans) e DeviceReadingResponseBase (leituras)

services/scale/        # só balança
  adapters/            # ble_gatt, ble_broadcast, ble_rm_rd2504a
  registry.py          # chave do adapter → implementação
  parsers.py           # bytes → ScaleReading
  stream.py            # WebSocket da pesagem
  persist.py           # grava ScaleMeasurement
  metrics.py + wla25.py + rm_rd2504a.py + reading.py

services/oximeter/     # PC-60NW
  ble.py               # scan + GATT
  parsers.py
  stream.py
  persist.py

services/blood_pressure/  # HEM-7530T
  ble.py               # scan + connect
  gatt_bp.py           # indicação BLE 0x2A35
  stream.py            # WebSocket da medição
  persist.py
  protocol.py / hem7530.py  # EEPROM (fallback só de medições desta sessão)
```

**Nova balança:** adapter em `services/scale/adapters/`, registrar em `registry.py`, parser em `parsers.py`, enum em `schemas/scale.py`. Rota não muda.

**Novo oxímetro:** parser/hints em `services/oximeter/`, não dentro de `scale/`.

**Novo tipo de periférico BLE:** reutilizar `services/ble/` (matcher + `scan_devices`/`wait_for_device`, `connect_with_fallback`, `DeviceWsSession` no stream); pasta própria em `services/<dispositivo>/`. Persistência disparada pelo stream usa `session.spawn(...)` para ser aguardada no fechamento.

Não gravar MAC de laboratório em `Settings` nem em `.env.example`. O totem e o operador escolhem o MAC na tela (igual oxímetro).

## 6. Banco e migrations

Postgres 16 (`docker-compose.yml`). Engine: `postgresql+asyncpg`. Schema em inglês: `a1b2c3d4e5f6_initial_schema.py` → `b2c3d4e5f6a7_seed_rm_rd2504a.py` → `c3d4e5f6a7b8_index_cleanup.py` (remove índices redundantes na PK, indexa `blood_pressure_readings.measured_at`). A PK já é indexada: não usar `index=True` em `id`.

```bash
make db-up
make migrate
# banco local sujo após squash:
make db-reset
make makemigrations m="slug_da_mudanca"
```

Toda mudança de schema vira revision em `alembic/versions/`. Não alterar só o model.

`alembic/env.py` importa `from app.models import Base` — por isso todo model novo precisa estar no `__init__.py`.

## 7. Auth e FHIR

- **Kiosk (produção):** `POST /login/registration` com `{ "registration": "...", "birth_date": "YYYY-MM-DD" }` → JWT + pessoa.
- JWT HS256. Pessoa: `PERSON_TOKEN_EXPIRE_MINUTES` (padrão 30); payload `sub` = UUID da pessoa, `typ` = `"person"`, `registration`. Operador: `OPERATOR_TOKEN_EXPIRE_MINUTES` (padrão 480); `sub` = e-mail, `typ` = `"user"`. Token sem `typ` é rejeitado.
- `SECRET_KEY` com menos de 32 caracteres gera aviso no boot.
- `/login`, `/login/registration` e `/login/lookup` (matrícula inexistente) contam falhas: `LOGIN_MAX_FAILURES_PER_SUBJECT` / `LOGIN_MAX_FAILURES_PER_IP` na janela `LOGIN_RATE_LIMIT_WINDOW_SECONDS` → 429. Só falhas contam porque todo login do totem sai do mesmo IP.
- Sem sessão válida, a SPA redireciona para `/matricula` (rótulo em português; não há login por e-mail no totem).
- Público: `GET /`, `GET /health`, `POST /login`, `POST /login/registration`, `POST /login/lookup`, `POST /people` (primeiro cadastro com matrícula), `POST /users` **somente se ainda não existir nenhum operador**.
- Token `typ=person`: só lê/grava a própria pessoa. `GET /people` (lista), DELETE pessoa, CRUD de balanças, scans BLE e FHIR exigem `typ=user`.
- WebSocket: query `token=`. Com token de pessoa, `person_id` da sessão é o `sub` — o cliente não troca de paciente.
- `POST /login` (e-mail/senha) é o login do operador (`typ` = `"user"`). O painel `/admin/*` usa essa sessão.
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
- MAC de hardware de laboratório como default de config.
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
