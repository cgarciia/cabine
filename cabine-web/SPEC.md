# SPEC — cabine-web

Documento de organização do frontend da Cabine. Use este arquivo como mapa: o que a SPA faz, o que vive em cada pasta, e o que **não** deve entrar no web.

O pacote é a SPA Vite em `cabine-web`. A API e o hardware BLE ficam em `cabine-core` (`cabine-core/SPEC.md`).

## 1. Papel do web

O `cabine-web` é a interface da cabine no chão de fábrica (totem) e a tela de operador no mesmo app:

- fluxo de kiosk: matrícula → menu → questionários, BIA, oximetria, pressão, relatório;
- primeiro cadastro (`POST /people`) e edição do cadastro da sessão;
- telas de operador em `/admin/*` (JWT de e-mail em `/admin/login`);
- sessão de totem em memória + `sessionStorage`; JWT em `localStorage`;
- HTTP/WebSocket para o core (nunca Bleak, nunca SQL).

Não é API, não fala com rádio BLE, não persiste Postgres. Isso é `cabine-core`.

## 2. Árvore (padrão)

```
cabine-web/
  src/
    main.tsx                 # StrictMode + App
    App.tsx                  # BrowserRouter, rotas, KioskProvider
    api.ts                   # Axios singleton, helpers HTTP/WS, login por matrícula
    index.css                # CSS global (cabine-* operador, kiosk-* totem)
    pages/
      kiosk/                 # fluxo do totem (uma rota = *Page.tsx)
      admin/                 # operador: Scale, Oximeter, People, Scales
    components/              # layout, forms, gráficos, diálogos, relatório
    kiosk/                   # KioskProvider + KioskLayout (só totem)
    session/                 # JWT, pessoa atual, chaves, payload de form, sessão local
    types/                   # contratos snake_case alinhados à API
    modules/
      health/                # questionário de triagem do kiosk
      mental/                # instrumentos HAD / AUDIT / WHO-5 + scoring
    advice/                  # textos de orientação (PT)
    utils/                   # cálculo puro (ex.: agrupamento de registros)
  vite.config.ts             # host 0.0.0.0:5173, proxy HTTP/WS → :8000
  SPEC.md                    # este arquivo
```

Fluxo obrigatório:

```
página → api.ts / session / modules → componente de UI
```

Página orquestra estado e chama `api` / helpers. Componente reutilizável não inventa URL da API se o fetch já existe em `api.ts`. Sem store global (Redux/Zustand/React Query).

## 3. O que foi organizado nesta revisão

| Antes | Agora | Por quê |
|---|---|---|
| Questionário de saúde em `data/questionnaires.ts` **e** `modules/health/questions.ts` | Só `modules/health/questionnaires.ts` | Uma fonte de perguntas. O kiosk é o fluxo de produção. |
| Páginas mortas (`HubPage`, `HealthPage`, `MentalHealthPage` antigo, `ClinicianHome`, `Settings`, `RoleEntry`) | removidas | Não estavam em `App.tsx`; duplicavam rotas e questionários. |
| `ScalePage` / `PeoplePage` / … na raiz de `pages/` | `pages/admin/` | Separar totem de operador. |
| Chaves `token`, `cabine-kiosk-session`, `cabine-person-id` | `cabine.*` em `session/keys.ts` | Mesmo prefixo; migração lê a chave antiga uma vez. |
| `fetchPersonMeasurements` tentando 3 URLs | `GET /people/{id}/measurements` | Contrato do core. |
| `ScalePayload` local nas páginas de balança **e** no CRUD de `/scales` | `ScaleLiveMessage` em `types/measurement.ts` | Nome do WS não colide com o POST de cadastro de balança. |
| WebSocket montado à mão em 4 páginas | `deviceSocket()` em `api.ts` | Token e base WS num só lugar. |
| Encerrar sessão no menu sem limpar JWT | `clearAccessSession()` + `clearSession()` | Próxima pessoa não herda o token. |
| `App.css` / cálculo local de composição não usados | removidos | Métricas de BIA vêm do core. |

**Mantidos de propósito**

- `session/cabineSession.ts` — espelho em `localStorage` do bloco mental (além do `KioskContext`).
- Classes `kiosk-*` — shell do totem; operador continua em `cabine-*`. Não misturar os dois prefixos na mesma tela.
- Telas `/admin/*` no mesmo SPA — o totem não aponta para elas no menu; o operador abre a URL.

Não há pasta `src/**/*.test.ts` ainda. Quando existir, fica ao lado do módulo ou em `cabine-web/src/**/__tests__/`.

## 4. Camadas

### `src/main.tsx` / `App.tsx`

`KioskProvider` envolve o router. Rotas públicas: `/`, `/matricula`, `/cadastro`. O restante passa por `RequireAuth` (JWT válido).

Subir o front (com o core em `:8000`):

```bash
cd cabine-web
npm install
npm run dev
# https://127.0.0.1:5173  (certificado autoassinado; necessário para o microfone)
```

Proxy em `vite.config.ts`. Em produção, `VITE_API_URL` aponta para a API; senão a origem do Vite + proxy.

### `src/api.ts`

Único Axios. Timeout 10 s. Bearer a partir de `getAccessToken()` (`cabine.token`). 401 (fora de `/login`) limpa sessão e manda para `/matricula` ou `/admin/login`.

| Função | Uso |
|---|---|
| `api` | GET/POST/PATCH/DELETE |
| `apiErrorMessage` | `detail` da API (PT) |
| `loginByRegistration` | `POST /login/registration` (`registration` + `birth_date`) |
| `loginOperator` | `POST /login` (e-mail/senha do operador) |
| `saveFormSubmission` | `POST /forms` |
| `fetchPersonMeasurements` / `fetchPersonForms` / `fetchPersonOximeter` / `fetchPersonBloodPressure` | filhos da pessoa |
| `saveOximeterReading` / `saveBloodPressureReading` | POST de leitura |
| `wsBaseUrl` / `withAccessToken` / `deviceSocket` | `/ws/scale`, `/ws/oximeter`, `/ws/blood-pressure` |

Não criar segundo cliente HTTP. Não usar `fetch` para a API.

### `src/session`

| Arquivo | Função |
|---|---|
| `keys.ts` | Todas as chaves `cabine.*` |
| `authSession.ts` | JWT + expiração (skew 10 s) |
| `currentPerson.ts` | UUID da pessoa da sessão |
| `cabineSession.ts` | Rascunho local (mental) por pessoa |
| `formPayload.ts` | Body estruturado de `health` / `mental` |
| `oximeterDevice.ts` | MAC do oxímetro |
| `bloodPressureDevice.ts` | MAC do HEM-7530T (vazio até o totem ou o operador gravar um) |

`KioskContext` guarda o andamento **desta visita** (`sessionStorage`, chave `cabine.kiosk-session`): pessoa, scores, última pesagem, última oximetria, última pressão.

### `src/kiosk`

`KioskLayout` — chrome do totem (usuário, sair, menu lateral). `useKiosk` só funciona dentro do provider.

### `src/pages/kiosk`

| Arquivo | Rota |
|---|---|
| `WelcomePage` | `/` |
| `RegistrationLoginPage` | `/matricula` |
| `RegistrationPage` | `/cadastro` (`?edit=1` exige JWT + pessoa) |
| `MenuPage` | `/menu` |
| `QuestionnairePage` | `/saude-geral` |
| `MentalHealthPage` (`KioskMentalHealthPage`) | `/saude-mental` |
| `KioskScalePage` | `/bioimpedancia` |
| `KioskOximeterPage` | `/oximetro` |
| `KioskBloodPressurePage` | `/pressao` |
| `CompletionPage` | `/conclusao` |
| `ReportPage` | `/relatorio` |
| `RecordsPage` | `/registros` |

### `src/pages/admin`

| Arquivo | Rota |
|---|---|
| `OperatorLoginPage` | `/admin/login` (público) |
| `ScalePage` | `/admin/avaliacao` |
| `OximeterPage` | `/admin/oximetria` |
| `BloodPressurePage` | `/admin/pressao` |
| `PeoplePage` | `/admin/pessoas` |
| `ScalesPage` | `/admin/balancas` |

`/pessoas` e `/balancas` redirecionam para `/admin/...`. `RequireOperator` envolve essas rotas e exige JWT `typ=user`.

### `src/types`

Contrato da API, **snake_case**: `person.ts`, `measurement.ts`, `oximeter.ts`, `bloodPressure.ts`, `scale.ts`, `form.ts`, `mental.ts` (instrumentos; não é recurso REST).

UI camelCase só no formulário; na borda usar `personFormToPayload` / payload explícito.

### `src/modules`

Conteúdo clínico estático. Persistência só via `saveFormSubmission` + `formPayload.ts` (`module`: `'health' | 'mental'`).

BIA, SpO2 e pressão **não** são questionário: WebSocket + POST de medição/leitura.

## 5. Auth e sessão

1. Totem: `POST /login/registration` (matrícula + nascimento) → `saveAccessSession` + `setPerson`.
2. Cadastro novo: `POST /people` (público, com matrícula e nascimento) e em seguida login por matrícula.
3. Operador: `/admin/login` → `POST /login` (e-mail/senha). Sem esse JWT, `/admin/*` redireciona.
4. HTTP autenticado: Bearer. WS: query `token=`.
5. Sem JWT no totem: `RequireAuth` → `/matricula`.
6. Sair / encerrar: `clearSession()` (kiosk) **e** `clearAccessSession()` (JWT, rascunhos `cabine.session.*` e chaves).

Token: `cabine.token` + `cabine.token-expires-at`. Pessoa: `cabine.current-person-id`.

Papel `patient` | `clinician` ficou de fora do produto (não há `src/role/`).

## 6. Hardware na UI

A página **não** calcula BIA. Manda perfil (altura, idade, sexo, tipo, `person_id`) na query do `/ws/scale` e persiste com `POST /measurements` quando a leitura chega.

Oxímetro: `/ws/oximeter`; kiosk ainda pode `POST /oximeters`. MAC em `cabine.oximeter-address`.

Pressão: `/ws/blood-pressure`. A etapa termina com sistólica/diastólica/pulso estáveis. O ECG via microfone (tom ~19 kHz do HEM-7530T) é opcional. MAC em `cabine.bp-address` (sem default de laboratório).

Dev local: Vite em **HTTPS** (`https://127.0.0.1:5173`) por causa do microfone; aceite o certificado autoassinado.

Um rádio no Windows: se balança, oxímetro e pressão falharem juntos, o lock está no **core**, não no front.

## 7. Nomenclatura

| Coisa | Padrão |
|---|---|
| Página | `FooPage.tsx`, `export function FooPage` |
| Componente | PascalCase, named export |
| Util / sessão | camelCase (`formPayload.ts`) |
| Tipo de API | interface, campos snake_case |
| Estado de form | camelCase |
| Rota SPA | português, kebab (`/saude-mental`, `/admin/avaliacao`) |
| Chamada HTTP | inglês, igual ao core |
| CSS totem | `kiosk-*` |
| CSS operador | `cabine-*` |
| Storage | `cabine.*` |
| Texto de UI / erro | português |

IDs: string UUID.

## 8. Como acrescentar uma tela

1. Página em `pages/kiosk/` ou `pages/admin/` com named export.
2. Rota em `App.tsx`. Se exigir login, dentro de `RequireAuth`.
3. Tipo em `src/types/` se a API mudou.
4. Função em `api.ts` se o fetch for reutilizado.
5. Path HTTP novo → entrada no `proxy` de `vite.config.ts`.
6. Questionário novo → `modules/<tema>/`, payload em `formPayload.ts`, `module` só `health` ou `mental`.

## 9. Nunca fazer neste pacote

- Segundo Axios, `fetch` solto para a API, URL `localhost:8000` hardcoded.
- Redux, Zustand, React Query, Tailwind, MUI, CSS modules novos sem decisão.
- Lógica Bleak / FHIR / SQL.
- Duplicar o questionário de saúde fora de `modules/health/questionnaires.ts`.
- Chave de storage sem prefixo `cabine.`.
- `any`.
- Default export novo em página (exceção histórica: nenhuma; `App` é named export).
- Engolir erro de API sem `apiErrorMessage` (salvo persistência best-effort com sessão local, como mental no kiosk).
- Calcular composição corporal no front quando o core já manda `metrics`.

## 10. Comandos locais

```bash
cd cabine-web
npm install
npm run dev      # Vite :5173
npm run build    # tsc -b && vite build
npm run lint
```

Health da API (core): `GET http://127.0.0.1:8000/health` → `{"status":"ok"}`.
O front em dev usa o proxy; não precisa apontar o browser para `:8000`.
