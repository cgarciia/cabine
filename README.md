# Cabine

Monorepo da cabine de avaliação: API e hardware em `cabine-core`, totem e painel em `cabine-web`.

Documentação, arquitetura e regras de desenvolvimento ficam em [`.cursor/`](./.cursor/README.md): specs em `.cursor/specs/` (índice em [`.cursor/specs/README.md`](./.cursor/specs/README.md)) e rules em `.cursor/rules/`.

## Requisitos

- Python ? 3.12 e [uv](https://docs.astral.sh/uv/)
- Node.js LTS
- Postgres 16 (`cabine-core/docker-compose.yml`)

## Os dois MVPs

Uma API atende os dois. Cada porta do Vite mostra um cardápio. Na raiz do repositório (ou em `cabine-core`):

```bash
make dev
```

- MVP 1 (questionário, bioimpedância, oximetria): `https://127.0.0.1:5173`
- MVP 2 (temperatura, pressão, oximetria): `https://127.0.0.1:5174`
- API: `http://127.0.0.1:8000/health` ? `{"status":"ok"}`

O certificado do Vite é autoassinado. O login de uma porta não apaga o da outra.

Antes da primeira vez: `cabine-core/.env` a partir de `.env.example`, `uv sync` em `cabine-core` e `npm install` em `cabine-web`. O `make dev` sobe o Postgres.

Sondas de laboratório ficam em `cabine-core/scripts/` e **não** sobem no servidor.

- Totem: `/` ? matrícula ? menu
- Painel: `/admin/login` (e-mail/senha do operador)

## Estrutura

- `cabine-core/`  FastAPI, Postgres, BLE
- `cabine-web/`  React + Vite
- `scripts/`  `dev.ps1` (usado por `make dev`)
- `.cursor/`  specs (arquitetura, fluxos, modelagem, API?) e rules (padrões de implementação e git)

## Contribuindo

Branches a partir de `develop`, commits em Conventional Commits (português) e PR com squash para `develop`. Detalhes: [`.cursor/rules/04-git-pr-commits.mdc`](./.cursor/rules/04-git-pr-commits.mdc).
