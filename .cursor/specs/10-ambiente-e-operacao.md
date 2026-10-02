# 10 — Ambiente e operação

## 1. Requisitos

- Windows (o BLE assume WinRT).
- Python ≥ 3.12 e [uv](https://docs.astral.sh/uv/).
- Node.js LTS.
- Docker (Postgres 16 via `cabine-core/docker-compose.yml`).
- PowerShell (os scripts de `make` usam `powershell`).

## 2. Primeira vez

```bash
cd cabine-core
cp .env.example .env     # ajustar SECRET_KEY (>= 32 chars) e Postgres
uv sync
cd ../cabine-web
npm install
```

`make dev` sobe o Postgres; as migrations rodam com `make migrate` em `cabine-core`.

## 3. Comandos

| Onde | Comando | O que faz |
|---|---|---|
| raiz ou `cabine-core` | `make dev` | Postgres + API `:8000` + MVP 1 `:5173` + MVP 2 `:5174` (`scripts/dev.ps1`) |
| `cabine-core` | `make db-up` / `db-down` | Sobe/derruba o Postgres |
| `cabine-core` | `make db-reset` | **Apaga o volume**, sobe de novo e migra (banco local sujo) |
| `cabine-core` | `make migrate` | `alembic upgrade head` |
| `cabine-core` | `make makemigrations m="slug"` | `alembic revision --autogenerate` |
| `cabine-core` | `make run` | Só a API (`uvicorn --reload`, `0.0.0.0:8000`) |
| `cabine-core` | `uv sync` | Instala dependências do `uv.lock` |
| `cabine-core` | `uv add <pkg>` / `uv lock` | Altera dependências (atualiza `pyproject.toml` + `uv.lock`) |
| `cabine-web` | `npm run dev -- --host 127.0.0.1 --port 5173 --mode mvp1` | Um MVP (use `5174`/`mvp2` para o outro) |
| `cabine-web` | `npm run build` | `tsc -b && vite build` |
| `cabine-web` | `npm run lint` | ESLint |

Health: `GET http://127.0.0.1:8000/health` → `{"status":"ok"}`. Painel: `/admin/login`. Totem: `/` → matrícula → menu.

## 4. Variáveis de ambiente (`cabine-core/.env`)

| Variável | Padrão | Uso |
|---|---|---|
| `POSTGRES_SERVER` / `_USER` / `_PASSWORD` / `_PORT` / `_DB` | — / — / — / 5432 / — | Conexão asyncpg |
| `SECRET_KEY` | — (obrigatória) | Assina JWT; ≥ 32 caracteres |
| `ALGORITHM` | `HS256` | JWT |
| `PERSON_TOKEN_EXPIRE_MINUTES` | 30 | Token do totem |
| `OPERATOR_TOKEN_EXPIRE_MINUTES` | 480 | Token do admin |
| `LOGIN_MAX_FAILURES_PER_SUBJECT` | 5 | Rate limit por matrícula/e-mail |
| `LOGIN_MAX_FAILURES_PER_IP` | 30 | Rate limit por IP |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | 300 | Janela do rate limit |
| `BACKEND_CORS_ORIGINS` / `BACKEND_CORS_ORIGIN_REGEX` | localhost / faixas privadas | CORS |
| `SQL_ECHO` | `false` | Log de SQL |
| `CABIN_STATE_PATH` | `""` (usa `%ProgramData%\Cabine\cabin.json`) | Arquivo de estado da cabine |

Front: `VITE_MVP_VERSION` (`.env.mvp1` / `.env.mvp2`) e, em produção, `VITE_API_URL`. Variável nova: entra em `Settings` **e** em `.env.example` (sem valor real) **e** nesta tabela.

## 5. Qualidade (estado atual)

| Item | Estado |
|---|---|
| Lint web | ESLint 10 + typescript-eslint + react-hooks + react-refresh (`eslint.config.js`); tinha 42 erros herdados em 25/09/2026 |
| Type-check web | `tsc -b` (parte do `npm run build`); deve passar limpo |
| Lint/format core | Nenhum configurado no `pyproject.toml`; `uvx ruff check app` avulso |
| Testes core/web | Não existem |
| CI | Não existe (sem GitHub Actions) |
| Deploy | Não existe; execução manual local |
| Monitoramento, backup, heartbeat | Não existem |

### Checagens mínimas antes de abrir PR

```bash
# web (cabine-web)
npm run build && npm run lint

# core (cabine-core)
uvx ruff check app
uv run python -c "from app.main import create_app; create_app()"   # import/boot sem erro
make migrate                                                       # migration aplica do zero (use make db-reset em banco local sujo)
```

Mudanças em BLE/hardware: testar com o aparelho real no totem e descrever no PR (checklist "Test plan").

## 6. Infra (estado)

- Postgres só em Docker local (`postgres:16-alpine`, volume `postgres_data`, container `cabine_postgres`).
- TLS: certificado **autoassinado** do Vite (`plugin-basic-ssl`).
- Totem: Windows em modo quiosque apontando para o front; impressão por `window.print()`.
- Sem Dockerfile da API, sem serviço Windows, sem política de backup.
