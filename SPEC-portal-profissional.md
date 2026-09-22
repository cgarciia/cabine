# SPEC Técnico — Portal do Profissional de Saúde

**Status:** aprovado — em implementação  
**Base analisada:** `cabine-core` (FastAPI/SQLAlchemy) e `cabine-web` (React/Vite)  
**Data:** 2026-09-22  

### Decisões de negócio aprovadas

| Tema | Decisão |
|------|---------|
| Cadastro profissional | Aberto (self-service), sem aprovação |
| CRM | Obrigatório no cadastro |
| Visibilidade de pacientes | Profissional vê **todos** os pacientes |
| Edição/exclusão de paciente | **Não** no portal (nem UI nem permissão de API para `role=professional`) |
| Paginação | `GET /people` com `q`, `limit`, `offset` |

---

## 1. Arquitetura proposta

### 1.1 Visão geral

O Portal do Profissional é uma **nova aplicação frontend** que consome o **mesmo backend** `cabine-core`. Dados de pacientes e avaliações **permanecem** nas tabelas já existentes; o portal **não** duplica o domínio clínico em outro banco.

```
┌─────────────────────┐     ┌─────────────────────┐
│  cabine-web         │     │  cabine-profissional│  ← NOVO (SPA)
│  (totem + operador) │     │  (profissional)     │
└─────────┬───────────┘     └─────────┬───────────┘
          │ HTTP/WS JWT               │ HTTP JWT
          └────────────┬──────────────┘
                       ▼
              ┌─────────────────┐
              │   cabine-core   │  ← EXTENSÕES PONTUAIS
              │  PostgreSQL     │
              └─────────────────┘
```

### 1.2 Princípios

| Princípio | Aplicação nesta solução |
|-----------|-------------------------|
| Baixo acoplamento | Portal fala só com contratos HTTP do `cabine-core`; não importa módulos do totem |
| Não duplicar regras | Cálculo de métricas BIA, validação de pessoa, persistência de leituras ficam no core |
| SOLID / MVC | Frontend: pages (View) → api/services (Controller/adapter) → types (Model). Backend: route → schema → crud/service (padrão já vigente) |
| Reutilizar | Auth JWT de operador, `people`, endpoints de histórico por tipo, lógica de agrupamento de visitas |
| Evitar abstrações | Sem microserviço novo, sem segundo banco, sem ORM paralelo para paciente |

### 1.3 Componentes

| Componente | Responsabilidade |
|------------|------------------|
| **cabine-profissional** (novo) | Login/cadastro do profissional; lista de pacientes; perfil; histórico/comparação de avaliações |
| **cabine-core** (existente + deltas) | Fonte única de verdade; autenticação; consultas de pessoas e registros de saúde; novos endpoints só onde faltar contrato |
| **cabine-web** | Continua totem + painel operador; **não** é o portal clínico (pode coexistir) |

### 1.4 Papéis de autenticação

Hoje o core tem dois `typ` de JWT:

| `typ` | Login atual | Uso |
|-------|-------------|-----|
| `person` | matrícula + data de nascimento | Totem (paciente) |
| `user` | e-mail + senha | Operador da cabine |

**Proposta:** reutilizar a tabela `users` e o login `POST /login`, diferenciando o profissional por um campo `role` (hoje **inexistente**, apenas comentário no model). O portal aceita apenas `role` de profissional (ex.: `professional`). Operadores (`operator` / default atual) continuam no `cabine-web` admin.

> **Informação faltante:** nome comercial do produto, política de aprovação de cadastro (auto-registro aberto vs. convite) e se o mesmo e-mail pode ser operador e profissional. Sinalizado na seção 8.

---

## 2. Entidades / modelos

### 2.1 Já existentes (reutilizar — mapeamento paciente)

A entidade de paciente do Cabine é `ScalePerson` / tabela `people` — **não** criar `Paciente` paralelo.

| Conceito do portal | Campo / entidade Cabine |
|--------------------|-------------------------|
| idUsuario | `people.id` (UUID) |
| nome | `people.name` |
| matrícula | `people.registration` |
| dataNascimento | `people.birth_date` |
| altura | `people.height_cm` |
| idade | `people.age` (derivada de `birth_date`) |
| sexo | `people.sex` (`male` \| `female`) |
| tipo corporal | `people.people_type` (`normal` \| `athlete`) |

### 2.2 Registros de saúde (já existentes — por tipo)

Não há entidade `Assessment` / `Avaliação` no banco. Uma “avaliação” é um **conjunto lógico** de registros que compartilham `visit_id` (UUID gerado no cliente do totem).

| Tipo | Tabela | Campos principais |
|------|--------|-------------------|
| Bioimpedância | `scale_measurements` | `weight_kg`, `metrics` (JSONB), `impedances_ohm`, `segments`, `visit_id`, `created_at` |
| Oximetria | `oximeter_readings` | `spo2_pct`, `pulse_bpm`, `pi_pct`, `visit_id`, `created_at` |
| Pressão | `blood_pressure_readings` | `sys_mmhg`, `dia_mmhg`, `pulse_bpm`, `measured_at`, `visit_id` |
| Questionários | `form_submissions` | `module` (`health` \| `mental`), `status`, `payload` (JSONB), `visit_id` |

### 2.3 Modelo lógico de “Visita / Avaliação” (agregado, não tabela obrigatória)

```
Visit (virtual)
  id........... visit_id (ou id sintético se legado sem visit_id)
  at........... data/hora âncora
  person_id.... people.id
  measurement.. ScaleMeasurement | null
  oximeter..... OximeterReading | null
  bloodPressure BloodPressureReading | null
  health....... FormSubmission (module=health) | null
  mental....... FormSubmission (module=mental) | null
```

Essa estrutura **já existe no frontend** (`cabine-web/src/utils/sessionBundles.ts` → `SavedVisit` / `groupSavedVisits`). A proposta é **elevar o contrato para o backend** (endpoint de visitas), sem necessariamente materializar tabela `visits` na primeira entrega.

### 2.4 Profissional (extensão mínima)

| Opção | Decisão |
|-------|---------|
| Nova tabela `professionals` | **Não** na v1 — duplicaria autenticação e CRUD de usuário |
| Estender `users` | **Sim** — alinhar ao comentário já presente em `User` |

Campos em `users` (novos):

| Campo | Tipo | Motivo |
|-------|------|--------|
| `role` | string (`operator` \| `professional`) | Autorização do portal vs. admin cabine |
| `full_name` | string | Nome do profissional |
| `crm` | string | CRM obrigatório no cadastro profissional (operadores: nullable) |

### 2.5 O que NÃO criar

- Tabela larga com uma coluna por pergunta de questionário  
- Cópia de bioimpedância/oximetria/pressão/formulários em outro schema  
- Entidade `Patient` desconectada de `people`  
- Tabela `answers` normalizada (payload JSONB já é o contrato; scoring vive no totem)

---

## 3. Estratégia de banco de dados

### 3.1 Análise do modelo atual

```
users                          ← operadores (estender para profissionais)
people                         ← pacientes da cabine
  ├── scale_measurements       ← BIA (+ snapshot de perfil na medição)
  ├── oximeter_readings
  ├── blood_pressure_readings
  └── form_submissions         ← questionários (payload JSONB)
scales                         ← dispositivos (irrelevante ao portal clínico)
fhir_patients                  ← FHIR isolado, sem FK para people (não usar na v1)
```

Índices úteis já existem em `person_id` e `visit_id` nas tabelas de leitura.

### 3.2 Estratégia escolhida

| Decisão | Justificativa |
|---------|---------------|
| **Reutilizar** `people` + 4 tabelas de registro | Já cobrem histórico temporal; evitam duplicação |
| **Não criar** tabela “avaliação gigante” | Tipos de registro evoluem de forma independente; JSONB já acomoda questionários |
| **Não materializar** `visits` na v1 | `visit_id` + agregação em serviço bastam para listar/comparar; materializar só se surgir metadado próprio (anotações clínicas, status de revisão) |
| **Migrar** apenas `users.role` (+ `full_name` se aprovado) | Mínimo necessário para login/cadastro do profissional |
| **Fallback legado** | Registros sem `visit_id`: manter regra do totem (janela de 45 min) no serviço de agregação |

### 3.3 Histórico ao longo do tempo

Cada linha nas tabelas de medição/formulário é um evento no tempo. A linha do tempo do paciente = visitas agregadas ordenadas por data. Comparação longitudinal usa o mesmo conjunto (ex.: `metrics.imc`, `sys_mmhg`/`dia_mmhg`, `spo2_pct` por visita).

### 3.4 Escrita vs. leitura

| Operação | Portal profissional v1 |
|----------|------------------------|
| Leitura de pacientes e avaliações | Sim |
| Escrita de medições / questionários | Não (origem = totem / operador) |
| Cadastro/login do profissional | Sim (apenas `users`) |

---

## 4. Integração com o Cabine

### 4.1 APIs existentes reutilizáveis

| Método | Endpoint | Uso no portal |
|--------|----------|---------------|
| `POST` | `/login` | Login do profissional (mesmo contrato OAuth2 form: `username`=email, `password`) |
| `POST` | `/users/` | Base do cadastro (hoje: público só se zero usuários; depois exige JWT de operador) |
| `GET` | `/users/me` | Sessão / “quem sou eu” |
| `GET` | `/people` | Lista de pacientes (**já restrito a JWT `user`**) |
| `GET` | `/people/registration/{registration}` | Busca por matrícula |
| `GET` | `/people/{person_id}/measurements` | Histórico BIA |
| `GET` | `/people/{person_id}/forms` | Histórico questionários |
| `GET` | `/people/{person_id}/oximeter` | Histórico oximetria |
| `GET` | `/people/{person_id}/blood-pressure` | Histórico pressão |
| `GET` | `/measurements/person/{person_id}` | Alternativa BIA |
| `GET` | `/forms/person/{person_id}` | Alternativa forms |
| `GET` | `/oximeters?person_id=` | Alternativa oximetria |
| `GET` | `/blood-pressures?person_id=` | Alternativa pressão |

Contratos de resposta já alinhados aos tipos do `cabine-web` (`ScalePerson`, `MeasurementRecord`, `OximeterReading`, `BloodPressureReading`, `FormSubmission`).

### 4.2 Lacunas reais (não inventar o que já existe)

| Necessidade | Situação atual |
|-------------|----------------|
| Perfil único por id | **Não existe** `GET /people/{person_id}` |
| Lista com busca/paginação | `GET /people` retorna lista completa, sem query params |
| Visitas agregadas | Agrupamento só no frontend do totem; **nenhum** endpoint por `visit_id` |
| Role profissional | Campo `role` **não existe** |
| Auto-cadastro profissional | `POST /users/` após o 1º usuário exige operador — impede self-service sem ajuste |
| Autorização por role | Qualquer `typ=user` tem acesso amplo (inclui DELETE people, scales, FHIR) |

### 4.3 Estratégia de integração

1. Portal autentica via `POST /login` e guarda JWT (`typ=user`).  
2. Core passa a emitir/validar `role` no token ou via `/users/me`.  
3. Rotas de leitura clínica aceitam `role=professional` (e mantêm `operator`).  
4. Rotas destrutivas / devices / FHIR **não** são expostas ao profissional (autorização no core).  
5. Portal **não** chama WebSockets BLE (fora do escopo clínico de consulta).

---

## 5. Endpoints necessários

### 5.1 Reutilizar sem mudança de contrato

- `POST /login`  
- `GET /users/me` (estender response com `role`, `full_name`)  
- `GET /people`  
- `GET /people/registration/{registration}`  
- Históricos por tipo listados na seção 4.1  

### 5.2 Novos ou alterados (justificados)

#### A) Extensão de usuário / cadastro profissional

**`POST /professionals/register`** (escolhido)

| Item | Definição |
|------|-----------|
| Responsabilidade | Self-service aberto só para profissional; não altera regras do operador |
| Entrada | `{ "email", "password", "full_name", "crm" }` |
| Saída | `{ "access_token", "token_type", "expires_in", "user" }` (login imediato) |
| Auth | Público |
| Relação | Insere em `users` com `role=professional` |

`POST /users/` permanece para operadores (bootstrap / operador autenticado).

#### B) Perfil de paciente por id

**`GET /people/{person_id}`**

| Item | Definição |
|------|-----------|
| Responsabilidade | Retornar um paciente sem depender de listar todos |
| Entrada | path `person_id` (UUID) |
| Saída | `PersonResponse` |
| Auth | JWT `user` com `role` in (`operator`, `professional`) |
| Relação | `people` |

#### C) Histórico agregado de visitas (principal delta de API)

**`GET /people/{person_id}/visits`**

| Item | Definição |
|------|-----------|
| Responsabilidade | Agrupar medições/oximetria/pressão/formulários por `visit_id` (fallback janela 45 min), espelhando `groupSavedVisits` |
| Entrada | path `person_id`; query opcional: `limit`, `offset` |
| Saída | `list[VisitBundle]` (ver abaixo) |
| Auth | JWT `user` com role permitido; profissional só leitura |
| Relação | Lê as 4 tabelas existentes; **não** cria tabela |

```json
{
  "id": "uuid-ou-sintetico",
  "visit_id": "uuid|null",
  "at": "2026-09-20T14:32:00Z",
  "measurement": { "...MeasurementResponse ou null" },
  "oximeter": { "... ou null" },
  "blood_pressure": { "... ou null" },
  "health": { "...FormSubmissionResponse ou null" },
  "mental": { "... ou null" }
}
```

**`GET /people/{person_id}/visits/{visit_id}`** (opcional v1.1)

| Item | Definição |
|------|-----------|
| Responsabilidade | Detalhe de uma visita |
| Auth | Idem |
| Nota | Se `visit_id` nulo no legado, usar o `id` sintético do bundle |

#### D) Lista de pacientes com paginação

**`GET /people?q=&limit=&offset=`** (contrato atualizado)

| Item | Definição |
|------|-----------|
| Responsabilidade | Busca por nome/matrícula + paginação |
| Saída | `{ "items": PersonResponse[], "total", "limit", "offset" }` |
| Auth | Operator / professional |
| Nota | `cabine-web` admin foi atualizado para consumir `items` |

### 5.3 Endpoints que o portal NÃO deve usar

| Endpoint | Motivo |
|----------|--------|
| `DELETE /people/{id}` | Fora do papel clínico |
| CRUD `/scales`, WS `/ws/*` | Operação de hardware |
| `POST /measurements`, `/oximeters`, `/blood-pressures`, `/forms` | Coleta é do totem |
| FHIR `/fhir/Patient/*` | Desconectado de `people`; escopo clínico FHIR indefinido |

---

## 6. Fluxo das telas

### 6.1 Mapa de telas (portal)

| # | Tela | Objetivo |
|---|------|----------|
| 1 | Login | E-mail + senha → `POST /login` |
| 2 | Cadastro | Nome + e-mail + senha → registro profissional |
| 3 | Lista de pacientes | Pacientes que já passaram pela Cabine (`GET /people`) |
| 4 | Perfil do paciente | Dados cadastrais + entrada para histórico |
| 5 | Histórico de avaliações | Lista de visitas por data |
| 6 | Detalhe da avaliação | Conteúdo de uma visita |
| 7 | Comparação (quando fizer sentido) | Mesma métrica em N visitas |

### 6.2 Fluxos

**A — Login**

1. Profissional informa e-mail/senha.  
2. Core valida `users` + `is_active` + `role=professional`.  
3. Portal armazena JWT e redireciona para a lista.

**B — Cadastro**

1. Se não possui conta, abre cadastro.  
2. `POST /professionals/register` (ou política acordada em `/users/`).  
3. Sucesso → login automático ou tela de login.

**C — Lista → Perfil → Histórico**

1. Lista carrega `GET /people` (com busca se disponível).  
2. Clique → `GET /people/{id}` + `GET /people/{id}/visits`.  
3. Cabeçalho do perfil: nome, matrícula, nascimento, altura, sexo.  
4. Corpo: lista de visitas (`at`, indicadores resumidos).  
5. Clique numa visita → detalhe completo.  
6. Ação “Comparar” (opcional na mesma tela) seleciona 2+ visitas e mostra tabela de evolução.

### 6.3 Navegação sugerida

```
/login
/cadastro
/pacientes                 ← lista / histórico global
/pacientes/:id             ← perfil + lista de visitas
/pacientes/:id/visitas/:vid ← detalhe (ou drawer/modal na mesma rota)
```

---

## 7. Forma de visualização do histórico

### 7.1 Unidade temporal: a visita

Seguir o modelo já validado no totem (`RecordsPage` + `SessionReport` + `groupSavedVisits`):

1. **Lista cronológica** (mais recente primeiro): data/hora, chips do que foi coletado (BIA / pressão / oximetria / saúde / mental).  
2. **Detalhe da visita:** seções na mesma ordem do relatório do totem — identificação, questionários, bioimpedância, oximetria, pressão.  
3. **Comparação longitudinal (justificada):** tabela simples de indicadores-chave entre visitas selecionadas — **sem gráficos na v1**.

### 7.2 Indicadores sugeridos para comparação tabular

| Domínio | Campos (já existentes) |
|---------|------------------------|
| BIA | `weight_kg`, `metrics.imc`, `metrics.gordura_pct`, `metrics.musculo_esqueletico_kg`, `metrics.agua_pct`, `metrics.gordura_visceral` |
| Pressão | `sys_mmhg`, `dia_mmhg`, `pulse_bpm` |
| Oximetria | `spo2_pct`, `pulse_bpm`, `pi_pct` |
| Questionário saúde | `payload.percent`, `payload.label` (e findings no detalhe) |
| Saúde mental | `payload.results[]` (instrumento, score, band) |

### 7.3 Por que não gráficos na v1

- O objetivo pedido é organizar e comparar; tabela atende com menor custo.  
- Séries temporais e faixas clínicas exigem regras de interpretação que **não estão no core** (scoring mental/saúde é do `cabine-web`).  
- Gráficos entram em fase posterior se o profissional validar a necessidade.

### 7.4 Reuso de UI (conceitual)

| Artefato web existente | Reuso no portal |
|------------------------|-----------------|
| `groupSavedVisits` | Lógica migrada/espelhada no core (`/visits`) |
| `SessionReport` / `BodyReport` | Referência de seções e labels; reimplementar no app do profissional (tema clínico, não totem) |
| `FormHistoryDialog` (não wired no admin) | Referência de exibição de payloads |

---

## 8. Decisões técnicas e justificativas

| # | Decisão | Justificativa |
|---|---------|---------------|
| 1 | Novo frontend, mesmo `cabine-core` | Evita segundo backend e duplicação de regras; core já é a API de domínio |
| 2 | Não duplicar dados clínicos | Fonte única; histórico já está nas 4 tabelas |
| 3 | Visita como agregado, não tabela v1 | `visit_id` + índices já existem; totem já agrupa assim |
| 4 | Estender `users` com `role` | Comentário explícito no model; login/`/users` já existem |
| 5 | Endpoint `/visits` no core | Portal e futuro admin deixam de reimplementar merge de 4 GETs |
| 6 | Profissional só leitura clínica | Separação de responsabilidade vs. operador (hardware/CRUD destrutivo) |
| 7 | Comparação tabular, sem gráficos v1 | Atende evolução temporal com escopo controlado |
| 8 | Não usar `fhir_patients` na v1 | Sem vínculo com `people`; risco de identidade dupla |
| 9 | Manter payload JSONB dos forms | Normalizar perguntas criaria schema paralelo ao totem sem ganho imediato |
| 10 | App separado de `cabine-web` | Personas e UX diferentes (totem touch vs. desktop clínico); evita misturar guards `person`/`operator` |

### 8.1 Informações ainda em aberto

- Nome oficial do produto / branding do portal  
- Especialidade / vínculo institucional (além do CRM)  
- Retenção/LGPD e auditoria de acesso (não existe audit trail)  
- Persistência de ECG (`ecg_mv`) e waveform de oximetria: enriquecimentos **client-side** no totem; podem estar ausentes na API  
- Necessidade de exportação PDF/CSV  

### 8.2 Resolvido na aprovação

- Cadastro aberto sem aprovação  
- CRM obrigatório  
- Profissional vê todos os pacientes  
- Sem editar/excluir paciente no portal / API para `professional`

### 8.3 Riscos

| Risco | Mitigação |
|-------|-----------|
| Profissional com JWT `user` atual acessaria DELETE/scales | Gate por `role` nas rotas sensíveis |
| Visitas antigas sem `visit_id` | Fallback 45 min (já usado no totem) |
| Lista `GET /people` sem paginação | Estender query params antes de escala real |
| Interpretação clínica indevida dos scores | UI deve tratar questionários como triagem (como o totem), não diagnóstico |

---

## 9. O que será reutilizado do Cabine

### 9.1 Backend (`cabine-core`)

| Artefato | Reuso |
|----------|-------|
| Tabela `people` + CRUD | Identidade do paciente |
| `scale_measurements`, `oximeter_readings`, `blood_pressure_readings`, `form_submissions` | Histórico clínico |
| `POST /login`, JWT HS256, `get_current_user` | Autenticação base |
| `POST /users/`, `GET /users/me` | Base de conta |
| `GET /people` e históricos por pessoa | Leitura |
| Schemas Pydantic de person/measurement/oximeter/BP/forms | Contratos de saída |
| `services/scale/metrics.py` (via responses existentes) | Métricas BIA já enriquecidas na leitura |
| Padrão route → schema → crud | Extensões (`/visits`, `role`) |

### 9.2 Frontend (`cabine-web`) — como referência, não como dependência

| Artefato | Reuso |
|----------|-------|
| Tipos TS em `src/types/*` | Contrato espelhado no portal |
| `groupSavedVisits` / `SavedVisit` | Spec do endpoint `/visits` |
| `SessionReport`, `BodyReport` | Layout de seções do detalhe |
| Fluxo admin `PeoplePage` | Incompleto (só BIA); portal cobre o gap com visitas agregadas |
| Auth storage pattern (`cabine.token`) | Adaptar namespace próprio (ex. `profissional.token`) |

### 9.3 Explicitamente fora do reuso direto

- Rotas e layout do totem (`Kiosk*`)  
- WebSockets e guias de dispositivos  
- `KioskContext` / sessionStorage de visita em andamento  
- Painel `/admin/*` como substituto do portal (persona e histórico incompletos)

---

## Implementação

Escopo desta entrega: deltas no `cabine-core` (lacunas 4.2 + CRM/role/paginação) e app `cabine-profissional` (somente leitura de pacientes).
