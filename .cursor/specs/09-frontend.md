# 09 — Frontend (`cabine-web`)

SPA Vite: totem (usuário) e painel (operador) no mesmo app. A API e o BLE ficam em `cabine-core`.

## 1. Papel do web

- fluxo de kiosk: matrícula → menu → questionários, BIA, oximetria, pressão, relatório;
- primeiro cadastro (`POST /users`) e edição do cadastro da sessão;
- telas de operador em `/admin/*` (JWT de e-mail em `/admin/login`);
- sessão de totem em memória + `sessionStorage`; JWT em `localStorage`;
- HTTP/WebSocket para o core (nunca Bleak, nunca SQL).

Não é API, não fala com rádio BLE, não persiste Postgres.

## 2. Árvore

```
cabine-web/
  src/
    main.tsx                 # StrictMode + App
    App.tsx                  # BrowserRouter, CabinGate, rotas, KioskProvider
    api.ts                   # Axios singleton, helpers HTTP/WS
    index.css                # CSS global (cabine-* operador, kiosk-* totem)
    config/mvp.ts            # módulos ativos por MVP
    pages/
      kiosk/                 # fluxo do totem (uma rota = *Page.tsx)
      admin/                 # operador
    components/              # layout, forms, gráficos, diálogos, relatório, AuthGuard, CabinGate
    hooks/                   # useDeviceSocket
    kiosk/                   # KioskProvider + KioskLayout (só totem)
    session/                 # JWT, usuário atual, chaves, payload de form, sessão local
    types/                   # contratos snake_case alinhados à API
    modules/health|mental/   # conteúdo clínico estático + scoring
    advice/                  # textos de orientação (PT)
    utils/                   # cálculo puro e formatação
  .env.mvp1 / .env.mvp2      # VITE_MVP_VERSION
  vite.config.ts             # host/porta, HTTPS, proxy HTTP/WS → :8000
```

Fluxo obrigatório:

```
página → api.ts / session / modules → componente de UI
```

Página orquestra estado e chama `api`/helpers. Componente reutilizável não inventa URL se o fetch já existe em `api.ts`. **Sem store global** (Redux/Zustand/React Query).

## 3. Camadas

### `App.tsx`

`KioskProvider` envolve o router. `CabinGate` fica dentro do `BrowserRouter` (a tela de cadastro usa o layout do totem) e garante que a cabine do PC está cadastrada (`/cabins/current`; senão `CabinSetupPage`). Rotas públicas: `/`, `/matricula`, `/cadastro`, `/admin/login`. O restante do totem passa por `<AuthGuard typ="person" redirectTo="/matricula" />`; `/admin/*` (exceto login) por `<AuthGuard typ="user" redirectTo="/admin/login" />`. Rota desconhecida → `/menu` (ou o padrão do painel dentro de `/admin`). Rotas de módulo são condicionadas por `hasModule(...)`.

### `src/api.ts`

Único Axios, timeout 10 s (scan: 30 s). Bearer de `getAccessToken()`. 401 (fora de `/login`) limpa sessão e redireciona.

| Grupo | Funções |
|---|---|
| Base | `api`, `apiBaseUrl`, `wsBaseUrl`, `withAccessToken`, `deviceSocket`, `WS_PATHS`, `apiErrorMessage` |
| Cabine | `fetchCurrentCabin`, `registerCabin`, `renameCabin` |
| Login | `lookupRegistration`, `loginByRegistration`, `loginOperator` |
| Usuários | `fetchPeople` / `createPerson` / `updatePerson` / `deletePerson` (chamam `/users`) |
| Balanças | `fetchScales`, `fetchScaleCatalog`, `createScale`, `updateScale`, `deleteScale`, `pickPreferredScale` |
| Aparelhos | `fetchDevices`, `scanDevices`, `pairDevice` |
| Leituras | `saveMeasurement`, `saveFormSubmission`, `saveOximeterReading`, `saveBloodPressureReading` |
| Histórico | `fetchPersonMeasurements` / `fetchPersonForms` / `fetchPersonOximeter` / `fetchPersonBloodPressure` (chamam `/users/{id}/*`) |

Não criar segundo cliente HTTP. Não usar `fetch` para a API.

> Dívida de nome: a API chama o recurso de `users`, mas o front ainda usa `Person*`/`ScalePerson`/`PeoplePage`/`currentPerson`. Contratos e URLs já estão corretos; a renomeação interna é opcional e deve ser um PR só disso.

### `src/session`

| Arquivo | Função |
|---|---|
| `keys.ts` | Todas as chaves `cabine.*` |
| `authSession.ts` | JWT + expiração (skew 10 s), `clearAccessSession()` |
| `currentPerson.ts` | UUID do usuário da sessão |
| `cabineSession.ts` | Rascunho local (mental) por usuário |
| `formPayload.ts` | Body estruturado de `health` / `mental` |
| `deviceAddress.ts` | MAC do oxímetro e do HEM-7530T (vazio até o aparelho se anunciar) |
| `visitId.ts`, `visitScope.ts` | Escopo da visita atual |

`KioskContext` guarda o andamento **desta visita** (`sessionStorage`, `cabine.kiosk-session`): usuário, scores, última pesagem/oximetria/pressão.

### `src/hooks`

`useDeviceSocket` — `connect`/`close`/`send` e reconexão (oxímetro 2,5 s, pressão 4 s; balança mostra "Reconectando…"). Toda página de periférico usa o hook; não montar WebSocket à mão.

### `src/pages/kiosk` (rota)

`WelcomePage` `/` · `RegistrationLoginPage` `/matricula` · `RegistrationPage` `/cadastro` (`?edit=1` exige JWT) · `CabinSetupPage` (gate) · `MenuPage` `/menu` · `QuestionnairePage` `/saude-geral` · `MentalHealthPage` `/saude-mental` · `KioskScalePage` `/bioimpedancia` · `KioskOximeterPage` `/oximetro` · `KioskBloodPressurePage` `/pressao` · `KioskWristBloodPressurePage` `/pressao-pulso` · `CompletionPage` `/conclusao` · `ReportPage` `/relatorio` · `RecordsPage` `/registros`.

### `src/pages/admin` (rota)

`OperatorLoginPage` `/admin/login` (público) · `ScalePage` `/admin/avaliacao` · `OximeterPage` `/admin/oximetria` · `BloodPressurePage` `/admin/pressao` · `WristBloodPressurePage` `/admin/pressao-pulso` · `PeoplePage` `/admin/pessoas` · `ScalesPage` `/admin/balancas` · `EquipmentPage` `/admin/equipamentos`. `/pessoas` e `/balancas` redirecionam para `/admin/...`.

### `src/types`

Contrato da API em **snake_case** (`person.ts`, `measurement.ts`, `oximeter.ts`, `bloodPressure.ts`, `scale.ts`, `form.ts`, `mental.ts`). UI camelCase só no estado de formulário; na borda usar `personFormToPayload` / payload explícito.

### `src/modules`

Conteúdo clínico estático. Persistência só via `saveFormSubmission` + `formPayload.ts` (`module`: `'health' | 'mental'`). BIA, SpO2 e pressão **não** são questionário: WebSocket + POST de leitura. **Não alterar texto clínico sem aprovação do time de saúde.**

## 4. Auth e sessão

1. Totem: `POST /login/registration` → `saveAccessSession` + `setPerson`.
2. Cadastro novo: `POST /users` (público) e em seguida login por matrícula.
3. Operador: `/admin/login` → `POST /login`.
4. HTTP: Bearer. WS: query `token=`.
5. JWT de pessoa ausente/expirado → `AuthGuard` limpa a sessão → `/matricula`. Token de operador não abre o totem e vice-versa.
6. Sair/encerrar: `clearSession()` **e** `clearAccessSession()`.

Chaves de storage: `cabine.token`, `cabine.token-expires-at`, `cabine.current-person-id`, `cabine.kiosk-session`, `cabine.oximeter-address`, `cabine.bp-address`, `cabine.bp-wrist-address`, rascunhos `cabine.session.*`.

## 5. UI do hardware

A página **não** calcula BIA: manda perfil (altura, idade, sexo, tipo, `user_id`) na query do `/ws/scale` e persiste com `POST /measurements`. Pressão termina com sistólica/diastólica/pulso estáveis; ECG por microfone (~19 kHz) é opcional. Dev em **HTTPS** (`https://127.0.0.1:5173`) por causa do microfone; aceite o certificado autoassinado.

## 6. Nomenclatura

| Coisa | Padrão |
|---|---|
| Página | `FooPage.tsx`, `export function FooPage` |
| Componente | PascalCase, named export |
| Util / sessão | camelCase (`formPayload.ts`) |
| Tipo de API | `interface`, campos snake_case |
| Estado de form | camelCase |
| Rota SPA | português, kebab (`/saude-mental`, `/admin/avaliacao`) |
| Chamada HTTP | inglês, igual ao core |
| CSS totem | `kiosk-*` |
| CSS operador | `cabine-*` (não misturar na mesma tela) |
| Storage | `cabine.*` |
| Texto de UI / erro | português |

IDs: string UUID.

## 7. Como acrescentar uma tela

1. Página em `pages/kiosk/` ou `pages/admin/` com named export.
2. Rota em `App.tsx`; se exige login, dentro do `AuthGuard` do `typ` certo; se é módulo, condicionar com `hasModule`.
3. Tipo em `src/types/` se a API mudou.
4. Função em `api.ts` se o fetch for reutilizado.
5. Path HTTP novo → `proxy` de `vite.config.ts`.
6. Questionário novo → `modules/<tema>/`, payload em `formPayload.ts`, `module` só `health` ou `mental`.
7. Atualizar esta spec e `03-fluxos.md`.

## 8. Nunca fazer neste pacote

- Segundo Axios, `fetch` solto para a API, URL `localhost:8000` hardcoded.
- Redux, Zustand, React Query, Tailwind, MUI, CSS modules novos sem decisão.
- Lógica Bleak / SQL / FHIR.
- Duplicar o questionário de saúde fora de `modules/health/questionnaires.ts`.
- Chave de storage sem prefixo `cabine.`.
- `any`.
- Default export novo em página (`App` também é named export).
- Engolir erro de API sem `apiErrorMessage` (salvo persistência best-effort com sessão local, como mental no kiosk).
- Calcular composição corporal no front quando o core já manda `metrics`.
- Chave de `localStorage`/`sessionStorage` declarada fora de `session/keys.ts`.

## 9. Testes

Ainda **não há** testes (`*.test.ts`). Quando existir, ficam ao lado do módulo ou em `src/**/__tests__/`. Primeiros candidatos: `modules/mental/scoring.ts`, `session/formPayload.ts`, `utils/*` puros.
