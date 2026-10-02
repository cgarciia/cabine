<!--
Título do PR = mensagem de commit final (Conventional Commits, em português):
  feat: ...  |  fix: ...  |  refactor: ...  |  docs: ...  |  chore: ...
Base: develop. Regras completas: .cursor/rules/04-git-pr-commits.mdc
-->

## Summary
-

## Checklist
- [ ] `npm run build` e `npm run lint` (web) / `uvx ruff check app` e boot do app (core)
- [ ] Migration incluída e aplicada do zero (`make migrate`), se mudou schema
- [ ] Specs em `.cursor/specs/` atualizadas
- [ ] `.env.example`, proxy do Vite, `src/types` e `api.ts` em dia, se mudou contrato
- [ ] Sem segredos, `.env`, logs ou debug no diff
- [ ] Hardware real testado (ou informado abaixo o que não foi validado)

## Notas para a revisão
<!-- Migrations, variáveis novas, BREAKING CHANGE, o que não foi testado. -->
