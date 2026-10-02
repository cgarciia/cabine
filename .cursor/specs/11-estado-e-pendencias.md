# 11 — Estado e pendências

Registro vivo do que existe, do que falta e do que está decidido a meio caminho. Atualize ao concluir ou descobrir algo. Data-base: 02/10/2026, branch `feat/modelagem-multi-cabine`.

## 1. Em andamento (não commitado no momento da escrita)

Trabalho da cabine por PC: `cabins.machine_id` (migration `g7b8c9d0e1f2`), `cabin_state.py`, `routes/cabins.py`, `crud/cabin.py`, `schemas/cabin.py`, `CabinGate`, `CabinSetupPage`, ajustes em `EquipmentPage`, `api.ts`, `vite.config.ts`.

## 2. Implementado

- Totem completo (matrícula → menu → questionários, BIA, oximetria, pressão de braço e pulso → relatório/registros) e painel `/admin/*`.
- API única `:8000` para os dois MVPs; cardápio por `mvp.ts`.
- Modelagem multi-cabine (`users`, `admins`, `cabins`, `device_types`, `devices`, `sessions`) e cadastro da cabine por `machine_id`.
- Pareamento de aparelhos com aparelho padrão por cabine/tipo.
- Aparelhos: RM-RD2504A, PC-60NW, YK-81C, HEM-7530T, HEM-6161T2.
- Rate limit de login; JWT separado por perfil.

## 3. Planejado / não implementado

| Item | Referência |
|---|---|
| Modo anônimo | `03-fluxos.md` §3 |
| Cardápio vindo de `cabins.modules` no front (hoje `mvp.ts`) | `01-visao-geral.md` §4 |
| JSON local com aparelho padrão (MAC, adapter, parser) e coleta offline | `03-fluxos.md` |
| Separação servidor × PC da cabine (core local → API central por HTTPS) | `02-arquitetura.md` §1 |
| Atualização automática (manifesto + atualizador) | `03-fluxos.md` §5 |
| Portal `cabine-profissional` (papéis e permissões, visitas, comparação) | `anexos/requisitos-portal-profissional.md` |
| Temperatura (módulo no MVP 2, sem tela) | `01-visao-geral.md` §3 |
| Integração da balança RelaxMedic 8 sensores (`60:65:F4:CA:05:77`), depende de captura nRF Connect | `anexos/relatorio-protocolos-balancas.md` |

## 4. Decisões registradas nos requisitos do portal (dos comentários `++…++`)

- **Tabela de visitas.** RN03 original dizia que visita é só `visit_id` lógico. A decisão do time é: **deve existir tabela de visitas**. No modelo multi-cabine isso já é atendido por `sessions` (com `status`); o portal deve consumir `sessions`, não reinventar agrupamento por janela de 45 min.
- **Papéis e permissões (RN05).** Vão existir papéis com níveis de permissão; alguns usuários admin poderão cadastrar, alterar e excluir dados de pacientes/usuários. Papéis ainda não definidos (RN14, perguntas abertas §9 do anexo).

## 5. Dívidas técnicas

| Dívida | Impacto | Sugestão |
|---|---|---|
| Sem testes (core e web) | Regressão silenciosa; refatoração BLE sem rede de segurança | Começar por parsers, scoring, rate limit, `formPayload` |
| Sem CI | Build/lint/type-check dependem de disciplina | GitHub Actions: `npm run build`/`lint`, `ruff`, boot do app, `alembic upgrade head` em Postgres de serviço |
| Sem linter/formatter no core | Estilo depende de revisão | Configurar `ruff` (lint + format) no `pyproject.toml` |
| ESLint com erros herdados (42 em 25/09) | Lint não passa limpo | Zerar e depois exigir limpo no CI |
| Front ainda usa `Person*`/`ScalePerson` para o recurso `users` | Confusão de nomes | Renomear em PR dedicado |
| `crud/cabin.py` importa `services/cabin_state` | Quebra a regra "CRUD não importa services" | Mover a orquestração para `services/` |
| JWT em `localStorage` | Exposição a XSS | Aceito para totem em quiosque; reavaliar para portal profissional |
| Sem `request_id`, sem trilha de auditoria | Sem rastreio de acesso a dado de saúde | Middleware de request id; tabela de auditoria |
| Sem consentimento, retenção, anonimização | Lacuna LGPD | Definir com o cliente (anexo §9 questões 14 e 17) |
| Sem versionamento do questionário | Resultados antigos sem referência à versão das perguntas | `version` no `payload` ou tabela |
| ECG do HEM-7530T ruidoso e não persistido | Sem valor clínico ainda | Melhorar filtragem; definir contrato de persistência |
| Sem Dockerfile da API / instalador / serviço Windows | Sem produção | Definir empacotamento da cabine |
| Divergência de doc legada (`people`, FHIR, `/login/matricula`) | Confusão | Já corrigido nestas specs; anexos são históricos |
| Teste da refatoração de 25/09 com aparelhos reais pendente | Risco de regressão de hardware | Teste no totem |

## 6. Perguntas em aberto (produto)

1. Lista fechada de aparelhos em produção vs. admin cadastrar novos?
2. O cadastro de aparelhos em `/admin/equipamentos` cobre o necessário?
3. SO definitivo da cabine (só Windows)?
4. Precisa funcionar offline? (o modo anônimo assume que sim para coleta sem gravação)
5. Quem pode ver dado de usuário além do operador (RH, gestor, profissional)? Vínculo usuário × empresa?
6. Retenção de dados e termo de consentimento.
7. A chave de desbloqueio do HEM-6161T2 em `app/services/blood_pressure/wrist_memory.py` é constante do protocolo ou segredo do aparelho de laboratório? Tirá-la do código pode impedir a leitura da memória.
8. O relatório (`BodyReport`) classifica tipo corporal e destaques no navegador, com limiares locais. Esse cálculo deve passar para o core, ou o texto fica como está até o time de saúde revisar?
9. `docs/`, `prototipo.html` e eventuais `SPEC.md` legados: apagar, já que a documentação vive em `.cursor/specs/`?

Perguntas do portal profissional: `anexos/requisitos-portal-profissional.md` §9.
