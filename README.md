# Cabine

Monorepo da cabine de avaliação: API e hardware em `cabine-core`, totem e painel em `cabine-web`.

Mapas de pasta e regras: `cabine-core/SPEC.md` e `cabine-web/SPEC.md`.

## Requisitos

- Python ? 3.12 e [uv](https://docs.astral.sh/uv/)
- Node.js LTS
- Postgres 16 (`cabine-core/docker-compose.yml`)

## Backend

```bash
cd cabine-core
cp .env.example .env   # SECRET_KEY e Postgres
uv sync
make db-up
make migrate
make run
```

Health: `GET http://127.0.0.1:8000/health` ? `{"status":"ok"}`.

Sondas de laboratório ficam em `cabine-core/scripts/` e **não** sobem no servidor.

## Frontend

```bash
cd cabine-web
npm install
npm run dev
```

O Vite escuta em `https://127.0.0.1:5173` (certificado autoassinado) e faz proxy HTTP/WS para a API em `:8000`.

- Totem: `/` ? matrícula ? menu
- Painel: `/admin/login` (e-mail/senha do operador)

## Estrutura

- `cabine-core/` — FastAPI, Postgres, BLE
- `cabine-web/` — React + Vite
- `docs/` — notas de protocolo de hardware
