# `.cursor/`

Tudo que orienta o desenvolvimento da Cabine (pessoas e agentes) fica aqui.

```
.cursor/
  specs/        # documentação do projeto (índice em specs/README.md)
    01-visao-geral.md … 11-estado-e-pendencias.md
    anexos/     # material histórico movido de docs/
  rules/        # regras do Cursor (.mdc) para implementação e git
```

## Specs

Documentação técnica e de produto, uma por assunto: visão geral, arquitetura, fluxos, modelagem, API, autenticação, hardware BLE, backend, frontend, ambiente/operação e estado/pendências. Índice e regra de precedência (código > specs > anexos) em [`specs/README.md`](./specs/README.md).

## Rules

Arquivos `.mdc` com frontmatter (`description`, `globs`, `alwaysApply`). O Cursor aplica cada uma conforme o tipo.

| Rule | Aplicação | Conteúdo |
|---|---|---|
| `00-projeto` | sempre | Visão, idiomas, fontes de verdade, mapa das specs |
| `01-fluxo-de-alteracao` | sempre | Checklist antes/durante/depois e o que atualizar por tipo de mudança |
| `02-backend-python` | `cabine-core/**/*.py` | Camadas, FastAPI, SQLAlchemy async, Pydantic |
| `03-frontend-react` | `cabine-web/src/**` | Camadas, Axios único, tipos, sessão, kiosk x admin |
| `04-git-pr-commits` | por descrição | Branches, commits (Conventional Commits), PR e merge em `develop` |
| `05-documentacao` | specs e READMEs | Como manter specs e rules |
| `06-banco-migrations` | models e Alembic | Padrões de modelo e migration |
| `07-hardware-ble` | `services/**`, rotas de aparelho | Rádio único, adapters, WebSocket |
| `08-seguranca` | auth, config, sessão | JWT por `typ`, segredos, LGPD |
| `09-qualidade-testes` | por descrição | Lint, build, testes e meta de CI |

O template de PR fica em `.github/pull_request_template.md` (o GitHub só lê desse caminho).

## Manutenção

Mudou código → atualize a spec no mesmo PR (`rules/01-fluxo-de-alteracao.mdc` §3). O agente errou de novo? Ajuste a rule. Divergência entre código e spec é bug de documentação.
