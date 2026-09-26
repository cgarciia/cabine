#  CabiNet IA — Levantamento do estado atual da Fase 1

**Versão do formulário:** 1.0 (modelo 2026-09-14)
**Preenchimento baseado no código do repositório em:** 25/09/2026 (revisão pós-refatoração; versão anterior: 23/09/2026)
**Branch observada:** `develop` (commit `986fbdd` — refatoração de segurança, rotas e código duplicado)

Este documento é um formulário. Preencha as respostas no lugar dos campos marcados com ☐ e ___. Onde houver tabela, complete uma linha por item. Se um item não existe na sua implementação, escreva “não existe” — isso é uma resposta válida e útil. Se não souber, escreva “não sei”. O objetivo é entender o que já está construído, sem julgamento, para ajustar o plano da Fase 1 ao que você está fazendo. Quanto mais concreto (nomes de arquivos, versões, comandos), melhor. Devolva o arquivo preenchido (.md ou .pdf) junto com os anexos da seção 9.

---

## 0. O que mudou desde a versão de 23/09/2026


| Área                         | Antes (23/09)                                                                                                               | Agora (25/09)                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal `cabine-profissional` | Descrito como “em implementação”, com `role`/`crm`/`full_name` em `users`, `/professionals/register`, `/people/{id}/visits` | **Nenhum código na** `develop`**.** Existem só os requisitos em `docs/cabine-profissional/requisitos.md`. As extensões do core citadas antes não estão no repositório.       |
| Rotas duplicadas             | `/measurements/person/{id}`, `/forms/person/{id}`, `GET /oximeters`, `GET /blood-pressures`, `/people/registration/{r}`     | Removidas. Histórico da pessoa só em `/people/{id}/{measurements,forms,oximeter,blood-pressure}`.                                                                            |
| Scan BLE                     | Qualquer JWT                                                                                                                | Só operador (`GET /oximeters/scan`, `GET /blood-pressures/scan`).                                                                                                            |
| Tokens                       | Um TTL único (`ACCESS_TOKEN_EXPIRE_MINUTES`)                                                                                | Pessoa (totem) 30 min; operador 480 min. Rotas de operador exigem claim `typ=user`.                                                                                          |
| Login                        | Sem limite de tentativas                                                                                                    | Limite em memória por IP e por matrícula/e-mail (conta só falhas; resposta 429 + `Retry-After`). bcrypt roda mesmo com e-mail inexistente (não revela quais contas existem). |
| CORS                         | `allow_credentials=True`                                                                                                    | `allow_credentials=False` (token vai no header, não em cookie).                                                                                                              |
| Guardas no front             | `RequireAuth` + `RequireOperator` (heurística de `@` no subject)                                                            | `AuthGuard` único, decide pela claim `typ` do JWT.                                                                                                                           |
| Código BLE                   | Scan/conexão/sessão WebSocket copiados em balança, oxímetro e pressão                                                       | Base comum em `services/ble/` (`scanner.py`, `connect.py`, `ws_session.py`). Gravações disparadas pelo stream agora são aguardadas quando o WebSocket fecha.                 |
| WebSocket no front           | Reconexão copiada em 6 páginas                                                                                              | Hook `hooks/useDeviceSocket.ts`.                                                                                                                                             |
| Oxímetros                    | PC-60NW                                                                                                                     | PC-60NW **e** Yonker YK-81C (anuncia como “Incoterm OX500 BLE”).                                                                                                             |
| Banco                        | —                                                                                                                           | Migração `c3d4e5f6a7b8`: remove índices redundantes em `id` e indexa `blood_pressure_readings.measured_at`.                                                                  |
| Código morto                 | Diálogos, ícones, constantes e tipos sem uso                                                                                | Removidos (front e core).                                                                                                                                                    |


---

## 1. Identificação


| Campo                                            | Resposta                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Nome do(a) responsável                           | Karla Carmo                                                            |
| Data do preenchimento                            | 2026-09-25 (atualização; 1ª versão em 2026-09-23)                      |
| Repositório(s) e branch principal                | `https://github.com/cgarciia/cabine.git` — branch observada: `develop` |
| Há quanto tempo o código está em desenvolvimento | ~4 semanas (01/09/26 - atual)                                          |
| Outras pessoas que contribuíram                  | Carlos Garcia                                                          |


---

## 2. Visão geral

Descreva em até 10 linhas o que o sistema faz hoje:

O monorepo **Cabine** tem API + hardware BLE em `cabine-core` e SPA React em `cabine-web` (totem + painel do operador no mesmo app).

No **totem**, a pessoa identifica-se por matrícula + data de nascimento, entra no menu e pode fazer questionários (saúde geral / saúde mental), bioimpedância, oximetria e pressão; ao final há relatório e impressão via diálogo do navegador (`window.print()`).

No **painel do operador** (`/admin/`*), o operador autentica com e-mail/senha e opera avaliação (balança), oximetria, pressão, lista de pessoas e cadastro de balanças.

Está **planejado** um terceiro frontend, `cabine-profissional` (portal clínico só leitura). Hoje ele existe apenas como documento de requisitos (`docs/cabine-profissional/requisitos.md`); não há código dele nem das extensões correspondentes no core na `develop`.


| Pergunta                                                         | Resposta                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quantas partes/serviços existem hoje?                            | **2 partes de software no repositório:** (1) `cabine-core` — API FastAPI + BLE no mesmo processo; (2) `cabine-web` — totem + painel. Postgres 16 via Docker Compose. O portal `cabine-profissional` está só em requisitos. **Não** há processo separado de “agente” no totem além do browser falando com o core.                                         |
| Onde cada parte roda (totem, servidor, nuvem)?                   | Em desenvolvimento local: Postgres em Docker; API com `uvicorn` na máquina (porta 8000); frontend Vite (HTTPS local, porta 5173). O BLE (Bleak) roda no processo do core, na máquina Windows que tem o Bluetooth (máquina do totem / desenvolvimento). Não fizemos deploy em nuvem.                                                                      |
| Já rodou em ambiente real (piloto, demonstração)? Onde e quando? | não                                                                                                                                                                                                                                                                                                                                                      |
| O que funciona de ponta a ponta hoje?                            | Fluxo totem (login por matrícula → módulos → relatório/impressão), painel operador (login → avaliação/oximetria/pressão/pessoas/balanças), API + Postgres + BLE para balança RM-RD2504A, oxímetros PC-60NW e Yonker YK-81C (Incoterm OX500) e pressão OMRON HEM-7530T.                                                                                   |
| O que está em construção ou quebrado?                            | Portal `cabine-profissional`: só requisitos, sem código. Pasta `tests/` no core: não existe. CI (GitHub Actions etc.): não existe. ECG do monitor de pressão: captura existe, mas a leitura ainda tem muito ruído (qualidade insuficiente). A refatoração de 25/09 foi validada por build/type-check/import, **ainda sem teste com os aparelhos reais**. |


---

## 3. Backend (servidor)

### 3.1 Stack


| Item                                          | Resposta                                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linguagem e versão                            | Python ≥ 3.12 (`requires-python = ">=3.12"`)                                                                                                                                                            |
| Framework web e versão                        | FastAPI **0.141.1** (pin no `uv.lock`); Uvicorn **0.52.4**                                                                                                                                              |
| ORM / acesso a banco                          | SQLAlchemy **2.0.52** (asyncio) + asyncpg                                                                                                                                                               |
| Banco de dados e versão                       | PostgreSQL **16** (`postgres:16-alpine` no `docker-compose.yml`)                                                                                                                                        |
| Ferramenta de migrations                      | Alembic **1.19.1**                                                                                                                                                                                      |
| Gerenciador de dependências e arquivo de lock | **uv** — `pyproject.toml` + `uv.lock`                                                                                                                                                                   |
| Outras bibliotecas relevantes                 | Pydantic **2.13** / pydantic-settings, bcrypt, python-jose (JWT HS256), bleak (BLE), fhir.resources, python-multipart, email-validator (valida formato de e-mail nos schemas de usuário via `EmailStr`) |


### 3.2 Estrutura

Árvore do backend (até ~3 níveis, pasta `app/`):

```
cabine-core/
  app/
    main.py
    api/
      router.py
      routes/          # auth, users, people, measurements, forms,
                       # oximeter, blood_pressure, scale, fhir_patients, health
    core/              # config, database, security, deps, rate_limit
    models/
    schemas/           # inclui ble.py (BleDevice/BleScanResponse, base das leituras)
    crud/              # inclui base.py (save, create_from_schema, list_by_person)
    services/
      ble/             # compartilhado: common, ids, winrt_patch,
                       # scanner, connect, ws_session
      scale/           # balança: adapters (ble_broadcast, ble_gatt, ble_rm_rd2504a),
                       # parsers, metrics, measurement, persist, stream
      oximeter/        # PC-60NW e YK-81C: ble, parsers, persist, stream
      blood_pressure/  # HEM-7530T: ble, protocol, gatt_bp, hem7530, persist, stream
      fhir.py
  alembic/
    versions/          # a1b2c3d4e5f6_initial_schema, b2c3d4e5f6a7_seed_rm_rd2504a,
                       # c3d4e5f6a7b8_index_cleanup
  docker-compose.yml
  Makefile
  pyproject.toml
  uv.lock
  SPEC.md
```


| Pergunta                                                                          | Resposta                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Como o código está organizado?                                                    | Por **camada**: `routes` → `schemas` → `crud` / `services`. Regras (no `SPEC.md`): rota não faz `select()`, CRUD não importa FastAPI nem services, rota não fala com BLE. Hardware BLE em `services/{ble,scale,oximeter,blood_pressure}`; tudo que é comum aos aparelhos fica em `services/ble/`.         |
| Existe separação entre “identidade do participante” e “dados da avaliação”? Como? | **Sim.** Identidade: tabela `people` (`ScalePerson`). Avaliações/leituras: `scale_measurements`, `oximeter_readings`, `blood_pressure_readings`, `form_submissions`, ligadas por `person_id` e opcionalmente `visit_id`. Usuários do sistema (`users`) são outra entidade (operador), não o participante. |


### 3.3 Modelo de dados

Tabelas/entidades existentes (campos principais; PK = `id` UUID + `created_at`/`updated_at` herdados de `Base`, salvo indicação):


| Tabela / entidade         | Campos principais                                                                                                                                                                                            | Chave primária (tipo) | Observações                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------ |
| `users`                   | email, hashed_password, is_active                                                                                                                                                                            | UUID                  | Operador. **Não** há `role`, `crm` nem `full_name` (eram do portal planejado). |
| `people`                  | name, registration, height_cm, age, birth_date, sex, people_type, expected_weight_kg                                                                                                                         | UUID                  | Participante/paciente da cabine                                                |
| `scales`                  | name, adapter, address, parser, is_active, is_default                                                                                                                                                        | UUID                  | Cadastro de balanças BLE                                                       |
| `scale_measurements`      | person_id, scale_id, scale_name, adapter, weight_kg, height_cm, age, birth_date, sex, people_type, expected_weight_kg, stable, complete, impedances_ohm (JSONB), segments (JSONB), metrics (JSONB), visit_id | UUID                  | BIA / peso                                                                     |
| `oximeter_readings`       | person_id, device_name, device_address, spo2_pct, pulse_bpm, pi_pct, stable, waveform (JSONB), visit_id                                                                                                      | UUID                  |                                                                                |
| `blood_pressure_readings` | person_id, device_name, device_address, sys_mmhg, dia_mmhg, pulse_bpm, movement, irregular_heartbeat, measured_at (indexado), visit_id                                                                       | UUID                  |                                                                                |
| `form_submissions`        | person_id, module (`health` ou `mental`, validado na API), status, payload (JSONB), visit_id                                                                                                                 | UUID                  |                                                                                |
| `fhir_patients`           | fhir_id, resource (JSONB)                                                                                                                                                                                    | UUID                  | FHIR isolado; **sem FK** para `people`                                         |



| Pergunta                                                                               | Resposta                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Como o participante é identificado?                                                    | Principalmente **matrícula** (`people.registration`, unique) + **data de nascimento** no login do totem (`POST /login/registration`). Também há UUID interno `people.id`.                                                                                                                                                                                    |
| Quais dados pessoais são guardados?                                                    | Em `people`: **nome**, **matrícula**, **altura**, **idade**, **data de nascimento**, **sexo**. **Não** há campos de CPF, e-mail, telefone ou foto na tabela `people`.                                                                                                                                                                                        |
| Existe campo ou tabela que liga o participante à empresa?                              | **não existe**                                                                                                                                                                                                                                                                                                                                               |
| As respostas do questionário são gravadas como texto ou como referência?               | Em `form_submissions.payload` (**JSONB**). No frontend de saúde geral o payload inclui mapa de respostas por **id da pergunta → ids das opções** (`answers`), além de score/`percent`/`label`/`findings` calculados no cliente. Saúde mental: instrumentos no front (`modules/mental`) com resultados no payload.                                            |
| O peso é gravado em tabela própria ou junto com outros dados? Com unidade e timestamp? | Em **tabela própria** `scale_measurements` (não misturado com oxímetro/pressão/forms). Campo `weight_kg` (unidade kg no nome). Timestamp: `created_at` (da Base). Também guarda na mesma linha outros dados da medição BIA (`metrics`, impedâncias, etc.) e `visit_id` opcional. O core descarta leituras repetidas (mesma pessoa, peso a ±0,15 kg em 90 s). |
| Estimativas (IMC, %gordura etc.) são gravadas ou calculadas na hora?                   | Gravadas em `scale_measurements.metrics` (JSONB). Cálculo no core (`services/scale/metrics.py`); método básico registra `"metodo": "imc_deurenberg"`; com impedâncias usa fluxo WLA/BIA. Não há campo separado de “versão da fórmula” além do que entra no JSON `metrics`. Na leitura, `metrics_from_stored` pode reutilizar o armazenado.                   |
| Existe versionamento do questionário (perguntas mudam sem quebrar avaliações antigas)? | Não. Não há tabela/versão de questionário no banco. As perguntas vivem no código do frontend (`cabine-web/src/modules/...`). O que fica salvo é o `payload` JSONB daquela avaliação; se as perguntas mudarem no código depois, as respostas antigas continuam no JSON como foram gravadas, mas sem um número de versão formal ligando “qual formulário era”. |
| Existe alguma rotina de anonimização, exclusão ou retenção?                            | não existe rotina automática no código. Existe `DELETE /people/{id}` (só operador).                                                                                                                                                                                                                                                                          |


### 3.4 API

Lista completa de endpoints na `develop` (extraída do OpenAPI gerado pelo FastAPI). Swagger/OpenAPI: gerado em runtime (`/docs`); **openapi.json commitado: não**.


| Método            | Rota                                                                  | O que faz                                                      | Autenticação                                                                                     |
| ----------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET               | `/` e `/health`                                                       | Healthcheck                                                    | Público                                                                                          |
| POST              | `/login`                                                              | Login do operador (e-mail/senha, form OAuth2) → JWT `typ=user` | Público, com limite de tentativas                                                                |
| POST              | `/login/lookup`                                                       | Verifica se a matrícula existe                                 | Público, com limite de tentativas                                                                |
| POST              | `/login/registration`                                                 | Login totem (matrícula + nascimento) → JWT `typ=person`        | Público, com limite de tentativas                                                                |
| POST              | `/users`                                                              | Criar usuário operador                                         | 1º usuário: público (bootstrap). Depois: só operador autenticado                                 |
| GET               | `/users/me`                                                           | Usuário atual                                                  | Operador                                                                                         |
| POST              | `/people`                                                             | Cadastro do participante (totem ou painel)                     | Público (cadastro no totem)                                                                      |
| GET               | `/people`                                                             | Lista de pessoas                                               | Operador                                                                                         |
| PATCH             | `/people/{id}`                                                        | Editar pessoa                                                  | Operador ou a própria pessoa                                                                     |
| DELETE            | `/people/{id}`                                                        | Excluir pessoa e histórico                                     | Operador                                                                                         |
| GET               | `/people/{id}/measurements`, `/forms`, `/oximeter`, `/blood-pressure` | Histórico da pessoa por tipo                                   | Operador ou a própria pessoa                                                                     |
| POST              | `/measurements`                                                       | Grava medição BIA/peso                                         | Operador ou a própria pessoa                                                                     |
| POST              | `/forms`                                                              | Grava questionário (`module` = `health` ou `mental`)           | Operador ou a própria pessoa                                                                     |
| POST              | `/oximeters`                                                          | Grava leitura de oximetria                                     | Operador ou a própria pessoa                                                                     |
| POST              | `/blood-pressures`                                                    | Grava leitura de pressão                                       | Operador ou a própria pessoa                                                                     |
| GET               | `/oximeters/scan`, `/blood-pressures/scan`                            | Procura aparelhos BLE próximos                                 | Operador                                                                                         |
| GET               | `/scales`, `/scales/catalog`, `/scales/{id}`                          | Lista/consulta balanças e adapters disponíveis                 | Operador ou pessoa                                                                               |
| POST/PATCH/DELETE | `/scales`, `/scales/{id}`                                             | Cadastro de balanças                                           | Operador                                                                                         |
| WS                | `/ws/scale`, `/ws/oximeter`, `/ws/blood-pressure`                     | Stream BLE                                                     | Token na query (`?token=`). Com token de pessoa, a pessoa não pode ser trocada no meio do stream |
| POST/GET          | `/fhir/Patient`, `/fhir/Patient/{fhir_id}`                            | FHIR Patient                                                   | Operador                                                                                         |



| Pergunta                                                            | Resposta                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existe openapi.json/Swagger gerado automaticamente? Está commitado? | Sim, gerado automaticamente pelo FastAPI quando a API está rodando (`/docs` e `/openapi.json`). Não há arquivo `openapi.json` versionado no Git                                                                         |
| Como os erros são retornados?                                       | HTTPException FastAPI com `detail` (string ou lista de validação Pydantic). Códigos 400/401/404/422/429 etc.                                                                                                            |
| A avaliação é enviada de uma vez no final ou passo a passo?         | Passo a passo: cada módulo faz POST próprio (forms, measurements, oximeters, blood-pressures) com o mesmo `visit_id` gerado no cliente do totem. Balança, oxímetro e pressão também gravam pelo próprio stream do core. |
| Existe conceito de “avaliação aberta / encerrada / abandonada”?     | não existe como status de visita no banco. Agrupamento lógico por `visit_id`. `form_submissions.status` existe (default `completed`). Não há serviço de agregação de visitas no core.                                   |


### 3.5 Autenticação e perfis


| Pergunta                                                                           | Resposta                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Como o operador do painel se autentica?                                            | E-mail + senha → `POST /login` → **JWT Bearer** (HS256, claim `typ=user`, validade padrão 480 min). Após 5 falhas por e-mail (ou 30 por IP) em 5 min, o login responde 429.                                                                                                                |
| Onde o token fica no navegador?                                                    | **localStorage** (`cabine.token` + `cabine.token-expires-at`, chaves em `cabine-web/src/session/keys.ts`). **Não** httpOnly cookie.                                                                                                                                                        |
| Quais perfis existem e o que cada um vê?                                           | **Dois:** JWT `typ=person` (participante do totem — só os próprios dados, validade 30 min) e JWT `typ=user` (operador — painel, cadastros, scans BLE, exclusão). Um token não abre as telas do outro perfil. Perfil `professional` **não existe** no código (só nos requisitos do portal). |
| Alguém do lado da empresa (RH, gestor) consegue ver dado de uma pessoa específica? | **não existe** perfil RH/gestor no código. Só o operador consegue listar/ver pessoas.                                                                                                                                                                                                      |
| Como o totem se autentica no servidor?                                             | `POST /login/registration` (matrícula + data de nascimento) → JWT de pessoa. Com limite de tentativas por matrícula e por IP.                                                                                                                                                              |
| Como a senha é armazenada?                                                         | **bcrypt** (`bcrypt.hashpw` / `checkpw` em `app/core/security.py`). A verificação roda mesmo quando o e-mail não existe, para o tempo de resposta não revelar contas.                                                                                                                      |


### 3.6 Logs, testes e qualidade


| Pergunta                                                    | Resposta                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biblioteca de log e formato?                                | `logging` padrão do Python em serviços BLE (texto). Sem stack estruturado JSON dedicado no app.                                                                                                                                                                                                                                                                        |
| O log contém matrícula, nome ou corpo de requisição?        | O que o código registra: logs de hardware BLE (conexão, notify, decode, falhas) e alguns `person_id`/peso ao salvar medições — **não** um access-log HTTP que grave toda matrícula/nome/corpo de cada request. Não há middleware de auditoria de acesso. Em runtime o nível de log (DEBUG/INFO) pode variar; o código não prevê dump completo do body das requisições. |
| Existe id de rastreio por requisição (request_id/trace_id)? | **não existe**                                                                                                                                                                                                                                                                                                                                                         |
| Framework de testes; quantos testes; como rodar             | Pasta `cabine-core/tests/`: **não existe**. Sem suíte de testes do projeto.                                                                                                                                                                                                                                                                                            |
| Cobertura aproximada                                        | não aplicável / ~0 no app                                                                                                                                                                                                                                                                                                                                              |
| Linters/type-checkers usados                                | Backend: sem linter configurado no `pyproject.toml`; na refatoração foi usado `ruff` avulso (`uvx ruff check app`) para imports não usados. Frontend `cabine-web`: ESLint + TypeScript (`tsc -b` limpo; o ESLint ainda acusa 42 erros herdados, era 46 antes da refatoração).                                                                                          |
| Existe CI? O que ele roda?                                  | **não existe** workflow GitHub Actions (ou similar) no repositório.                                                                                                                                                                                                                                                                                                    |


---

## 4. Frontend

### 4.1 Stack


| Item                       | Resposta                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Framework e versão         | React **19.2.8**                                                                                      |
| Linguagem (TS/JS) e versão | TypeScript **~6.0.2**                                                                                 |
| Bundler / dev server       | Vite **8.2.2** (+ `@vitejs/plugin-basic-ssl`)                                                         |
| Roteamento                 | react-router-dom **7.18.3**                                                                           |
| Estado de servidor / cache | **nenhum** (TanStack Query/Redux não usados) — fetch via axios + state local React / context do kiosk |
| Cliente HTTP               | **axios** (um único cliente em `src/api.ts`, com um helper por endpoint)                              |
| UI / design system / CSS   | CSS global próprio (`index.css`); ícones **lucide-react**                                             |
| Formulários e validação    | Controles React controlados; validação de API via Pydantic no backend                                 |


### 4.2 Aplicações e telas

Árvore resumida de `cabine-web/src`:

```
src/
  main.tsx, App.tsx, api.ts, index.css
  pages/
    kiosk/       # Welcome, RegistrationLogin, Registration, Menu, Questionnaire,
                 # MentalHealth, KioskScale, KioskOximeter, KioskBloodPressure,
                 # Completion, Report, Records
    admin/       # OperatorLogin, Scale, Oximeter, BloodPressure, People, Scales
  components/    # AuthGuard, AppLayout, KioskBackButton, HistoryDialog, BodyReport,
                 # SessionReport, gráficos e ilustrações
  hooks/         # useDeviceSocket (WebSocket dos aparelhos, com reconexão)
  kiosk/         # KioskProvider + KioskLayout
  session/       # authSession, keys, currentPerson, deviceAddress, visitId, ...
  types/         # contratos snake_case alinhados à API
  modules/       # health (triagem) e mental (instrumentos + scoring)
  advice/        # textos de orientação
  utils/         # formatWhen, friendlyScaleStatus, sessionBundles, ...
```


| Pergunta                                                     | Resposta                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quantas aplicações existem? São projetos separados ou um só? | **Uma aplicação front:** `cabine-web` (totem + painel no **mesmo** projeto Vite). Backend separado. O portal `cabine-profissional` está só em requisitos.                                                                                        |
| A tela do totem e o painel compartilham código? Qual?        | **Sim, no mesmo repo** `cabine-web`: `api.ts` (helpers HTTP e WebSocket), `hooks/useDeviceSocket`, `types/`, `AuthGuard`, componentes de relatório/histórico, CSS, sessão JWT. Layouts e páginas são separados (`pages/kiosk` vs `pages/admin`). |


Rotas principais:


| Aplicação           | Rota / tela                                              | O que faz                            | Estado                                                    |
| ------------------- | -------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| cabine-web totem    | `/`                                                      | Boas-vindas                          | pronta                                                    |
| cabine-web totem    | `/matricula`                                             | Login por matrícula                  | pronta                                                    |
| cabine-web totem    | `/cadastro`                                              | Cadastro participante                | pronta                                                    |
| cabine-web totem    | `/menu`                                                  | Menu de módulos                      | pronta                                                    |
| cabine-web totem    | `/saude-geral`, `/saude-mental`                          | Questionários                        | pronta                                                    |
| cabine-web totem    | `/bioimpedancia`, `/oximetro`, `/pressao`                | Coletas                              | pronta                                                    |
| cabine-web totem    | `/conclusao`, `/relatorio`, `/registros`                 | Encerramento / relatório / histórico | pronta                                                    |
| cabine-web admin    | `/admin/login`                                           | Login operador                       | pronta                                                    |
| cabine-web admin    | `/admin/avaliacao`, `/admin/oximetria`, `/admin/pressao` | Operação assistida                   | pronta                                                    |
| cabine-web admin    | `/admin/pessoas`, `/admin/balancas`                      | Cadastros                            | pronta (pessoas: histórico BIA)                           |
| cabine-profissional | —                                                        | Portal clínico                       | não existe (só requisitos em `docs/cabine-profissional/`) |


Rotas desconhecidas redirecionam para `/menu` (totem) ou `/admin/avaliacao` (painel). Rotas do totem exigem JWT de pessoa (`AuthGuard typ="person"` → `/matricula`); rotas do painel exigem JWT de operador (`AuthGuard typ="user"` → `/admin/login`).

### 4.3 Comportamento da tela do totem


| Pergunta                                                   | Resposta                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Como o participante se identifica na tela?                 | Matrícula + data de nascimento (`/matricula`). Cadastro novo em `/cadastro`.                                                                                                                                                                                                      |
| Como a tela fala com o backend?                            | Via proxy do Vite em dev para `http://127.0.0.1:8000` (HTTP + WS). Em runtime: axios/`api.ts` e WebSockets (`useDeviceSocket`) para streams BLE.                                                                                                                                  |
| A tela guarda algo no navegador?                           | **Sim:** JWT em `localStorage`; sessão do kiosk (incl. `visitId`) em `sessionStorage`; endereço MAC de dispositivos (oxímetro/pressão) em `localStorage`. Ao sair/encerrar, a sessão do kiosk e o JWT são apagados; JWT expirado também limpa a sessão e volta para `/matricula`. |
| O que acontece quando a rede cai no meio de uma avaliação? | comportamento offline não documentado. Oxímetro e pressão reconectam o WebSocket sozinhos (2,5 s e 4 s); a balança mostra “Reconectando…”.                                                                                                                                        |
| Como a tela recebe o peso da balança?                      | WebSocket `/ws/scale` (core faz BLE e envia eventos à tela).                                                                                                                                                                                                                      |
| Existe impressão? Como? Que impressora?                    | **Sim** — `window.print()` (diálogo do navegador). Modelo de impressora: EPSON L6270.                                                                                                                                                                                             |
| O totem opera sozinho ou com operador ao lado?             | **Sozinho (self-service):** o próprio usuário preenche os dados e se avalia no totem. Existe também um painel de operador (`/admin`) no mesmo app, para operação assistida / cadastros, mas o fluxo principal do totem é sem operador ao lado.                                    |
| Navegador e modo (quiosque, tela cheia, normal)?           | Em campo: **modo quiosque** (kiosk). Em desenvolvimento: navegador normal com Vite (HTTPS local).                                                                                                                                                                                 |


### 4.4 Build e qualidade


| Pergunta                          | Resposta                                                                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comandos de build, dev e testes   | `cabine-web`: `npm run dev`, `npm run build`, `npm run lint`. Backend: `uv sync`, `make db-up` / `docker compose up -d`, `make migrate` / `alembic upgrade head`, `make run` / `uvicorn`. Testes automatizados: não existem. |
| Linters e type-check              | ESLint + `tsc -b` no web.                                                                                                                                                                                                    |
| Testes existentes (quantos, tipo) | **não existe**                                                                                                                                                                                                               |


---

## 5. Serviço no totem (hardware, balança, integração)


| Pergunta                                                      | Resposta                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existe um programa rodando no totem além do navegador?        | **Não** como app separado. O **mesmo** processo `cabine-core` (FastAPI + Bleak) precisa estar acessível à máquina que tem o rádio BLE (tipicamente o Windows do totem).                                                                                                                                                                                                |
| Como ele é instalado e iniciado?                              | **Manual por terminal** (não há serviço Windows / NSSM / Task Scheduler no repo). No dia a dia: (1) `cabine-core`: `docker compose up -d` → `uv run alembic upgrade head` → `uv run uvicorn app.main:app --reload --port 8000`; (2) em outro terminal, `cabine-web`: `npm run dev -- --host 127.0.0.1 --port 5173`. Navegador em modo quiosque apontando para o front. |
| Sistema operacional do totem e versão                         | Código BLE assume Windows (patches WinRT no core, aplicados uma vez ao importar `services/ble`). Versão exata do SO em campo: não sei.                                                                                                                                                                                                                                 |
| Modelo da balança e forma de comunicação?                     | **RM-RD2504A**, BLE GATT (adapter `ble_rm_rd2504a` / parser dedicado). O cadastro também aceita balanças genéricas pelos adapters `ble_broadcast` (anúncio) e `ble_gatt`.                                                                                                                                                                                              |
| Biblioteca usada para falar com a balança                     | **Bleak** (Python) no `cabine-core`                                                                                                                                                                                                                                                                                                                                    |
| Como o peso chega à tela?                                     | **WebSocket** `/ws/scale`                                                                                                                                                                                                                                                                                                                                              |
| Como o serviço do totem fala com o servidor?                  | O core é o servidor. A tela fala HTTP/WS com o core. Não há fila/sincronização offline dedicada no código.                                                                                                                                                                                                                                                             |
| O totem guarda dados localmente (banco, arquivos, fila)?      | Persistência oficial no **Postgres** do core. No browser: session/localStorage (sessão e token), não banco local de avaliações.                                                                                                                                                                                                                                        |
| Existe algum sinal de “estou vivo” do totem para o servidor?  | **não existe** heartbeat de totem além de `/health` da API.                                                                                                                                                                                                                                                                                                            |
| Como o serviço sabe se a balança/impressora está funcionando? | Balança/oxímetro/PA: via scan/stream BLE e eventos no WS. Um único lock (`ble_radio_lock`) serializa o uso do rádio Bluetooth entre os aparelhos. Impressora: só via diálogo do browser — sem healthcheck no código.                                                                                                                                                   |
| Problemas conhecidos de hardware/driver                       | Há documentação em `docs/relatorio-protocolos-balancas.md` e notas no `cabine-core/SPEC.md`. O WinRT às vezes devolve descritores GATT quebrados (há patch) e a conexão pode precisar de várias tentativas (cache ligado/desligado), hoje centralizadas em `services/ble/connect.py`.                                                                                  |
| Outros sensores ou dispositivos                               | **Oxímetros** PC-60NW e Yonker YK-81C / Incoterm OX500 BLE (BLE); **pressão** OMRON HEM-7530T (BLE, com pareamento); ECG por microfone (tom do HEM-7530T) opcional no front.                                                                                                                                                                                           |


Árvore do “serviço” de hardware: dentro de `cabine-core/app/services/` (não é repo separado) — ver seção 3.2.

---

## 6. Infraestrutura e operação


| Pergunta                                      | Resposta                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde o servidor roda hoje?                    | Desenvolvimento: máquina local.                                                                                                                                                                                                                                                                                         |
| Como o deploy é feito?                        | Repo descreve fluxo local (Docker Postgres + uvicorn + npm). Pipeline CI/CD: não existe no repo.                                                                                                                                                                                                                        |
| Existe Dockerfile/docker-compose?             | **docker-compose.yml** no core **só para Postgres**.                                                                                                                                                                                                                                                                    |
| Como o totem alcança o servidor?              | Em dev: localhost / rede local via IP da API. Produção: não existe.                                                                                                                                                                                                                                                     |
| Existe TLS/HTTPS? Como?                       | Front Vite com certificado **autoassinado** (`@vitejs/plugin-basic-ssl`).                                                                                                                                                                                                                                               |
| Existe backup do banco?                       | Volume Docker `postgres_data`. Política de backup/restauração: não existe.                                                                                                                                                                                                                                              |
| Existe monitoramento ou alerta?               | não existe.                                                                                                                                                                                                                                                                                                             |
| Variáveis de ambiente e segredos: onde ficam? | `.env` local (template `.env.example`); `.env` não vai para o git. Novas variáveis: `PERSON_TOKEN_EXPIRE_MINUTES`, `OPERATOR_TOKEN_EXPIRE_MINUTES`, `LOGIN_MAX_FAILURES_PER_SUBJECT`, `LOGIN_MAX_FAILURES_PER_IP`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`. A API avisa no boot se `SECRET_KEY` tiver menos de 32 caracteres. |


---

## 7. Dados pessoais e conformidade


| Pergunta                                                                              | Resposta                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista completa de dados pessoais coletados (na tela e no cadastro)                    | Participante: nome, matrícula, data de nascimento, idade, altura, sexo, tipo corporal, peso esperado (opcional); leituras de saúde (peso/BIA metrics, SpO₂, PA, respostas de questionários). Operador: e-mail, senha (hash).      |
| Existe termo de consentimento? Onde é aceito e guardado?                              | não existe tabela de consentimento no modelo.                                                                                                                                                                                     |
| Quem tem acesso a dados individuais hoje?                                             | Contas de operador (e a própria pessoa no totem, só aos próprios dados). Profissional de saúde: não existe no código. RH/gestor: não existe.                                                                                      |
| Existe registro de quem consultou o quê (trilha de auditoria)?                        | **não existe**                                                                                                                                                                                                                    |
| Prazo de retenção definido?                                                           | não sei                                                                                                                                                                                                                           |
| Existe texto na tela/impresso que sugira diagnóstico, aptidão ou risco? Cole exemplos | Há textos de orientação/triagem no frontend (`advice/patientAdvice.ts` — inclui orientação de oximetria e de saúde mental —, labels de questionários, findings de BIA). Exemplos literais completos: ver código / prints (anexo). |
| Quem aprovou os textos e faixas de referência (médico, fonte)?                        | Perguntas, respostas e resultados dos questionarios de saúde geral e mental foram elaboradas pelo time de saúde (Dr. Guilherme e Dr. Edu).                                                                                        |


---

## 8. Dificuldades, decisões e próximos passos


| Pergunta                                                               | Resposta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quais decisões técnicas você tomou que considera importantes e por quê | Montamos inicialmente um SPEC para alinhar escopo e organização. Definimos as bibliotecas de trabalho (ex.: Bleak para BLE no Windows). Desenvolvemos a partir de um modelo HTML disponibilizado pelo Ger. Marcus, seguindo as perguntas e condições do time de saúde. Arquitetura: API + BLE no `cabine-core`, totem e painel no mesmo SPA (`cabine-web`), visita lógica por `visit_id`, questionários em JSONB. Em 25/09 fizemos uma revisão de código com refatoração em 4 fases: segurança (tokens separados, limite de login), limpeza de rotas duplicadas, remoção de código morto e unificação do código BLE/WebSocket repetido. |
| O que você faria diferente se começasse hoje                           | Documentaria o desenvolvimento desde o início; faria commits menores e mais frequentes (evitar grandes mudanças em um único commit); seguiria um plano de atividades compartilhado com o time de desenvolvimento.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Maiores dificuldades encontradas (técnicas ou de requisito)            | Conectar e estabilizar a balança de 8 sensores (BIA / RM-RD2504A via BLE no Windows). Trazer uma boa leitura do eletrocardiograma no monitor de pressão: a captura existe, mas ainda há muito ruído e a qualidade não está boa.                                                                                                                                                                                                                                                                                                                                                                                                         |
| O que está planejado para as próximas semanas                          | Testar a refatoração com os aparelhos reais no totem. Portal profissional (requisitos em `docs/cabine-profissional/requisitos.md`), que exigirá perfis novos no core. Avaliar testes automatizados e CI.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Dúvidas que você tem sobre o produto ou a arquitetura                  | (1) Quais dispositivos serão oficiais em produção (lista fechada) vs. o admin cadastrar novos ao longo do uso? (2) O cadastro de dispositivos no `/admin` cobre o que o produto precisa, ou falta algo? (3) Em qual SO a cabine sobe de forma definitiva (só Windows do totem)? (4) Precisa funcionar offline (sem rede / sem Postgres remoto)?                                                                                                                                                                                                                                                                                         |


---

## 9. Anexos solicitados

Marque o que está enviando (ajustar ao pacote real):

- [x] Árvore de pastas — incluída neste documento (seções 3.2 e 4.2)
- [x] Lista de rotas (seção 3.4); openapi.json exportável em runtime via `/openapi.json` quando a API estiver no ar
- [x] Esquema do banco: models SQLAlchemy + migrations em `cabine-core/alembic/versions/`
- [x] Dependências: `cabine-core/pyproject.toml` + `uv.lock`; `cabine-web/package.json` + lock
- [x] `cabine-core/docker-compose.yml` (Postgres)
- [ ] Configuração de CI — **não existe**
- [ ] Prints das telas principais do totem e do painel — pasta `docs/01-levantamento-anexos/imagens/` (**ainda não está no repositório**; adicionar antes de enviar)
- [x] Exemplo do papel impresso — mesma pasta transire
- [x] Textos exibidos ao participante — no repo: `cabine-web/src/advice/`, `cabine-web/src/modules/health/`, `cabine-web/src/modules/mental/`
- [x] Documentação existente: `README.md`, `cabine-core/SPEC.md`, `cabine-web/SPEC.md`, `docs/cabine-profissional/requisitos.md`, `docs/relatorio-protocolos-balancas.md`

---

**Notas finais para o(a) responsável**

1. Revise a seção **0** (mudanças) e a seção **8** com a sua visão.
2. Preencha os `não sei` que você souber (piloto, produção, backup, consentimento, aprovação clínica).
3. Adicione a pasta `docs/01-levantamento-anexos/imagens/` com os prints antes de enviar.
4. Não inventei ambiente de produção, prazos de retenção, aprovação médica nem contribuidores.

