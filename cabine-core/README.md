# cabine-core

API da Cabine (FastAPI, Postgres, BLE). Um processo em `:8000` para totem e painel.

Mapa de camadas e regras: **[`.cursor/specs/08-backend.md`](../.cursor/specs/08-backend.md)** (índice em [`.cursor/specs/README.md`](../.cursor/specs/README.md)).

```bash
cp .env.example .env
uv sync
make dev
```

`make dev` sobe o Postgres e a API. Health: `http://127.0.0.1:8000/health`.

Sondas de laboratório ficam em `scripts/` e não sobem no servidor.
