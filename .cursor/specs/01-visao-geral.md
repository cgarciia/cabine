# 01 — Visão geral

## 1. O que é

Monorepo da **Cabine**: uma cabine de avaliação de saúde para o chão de fábrica. A pessoa se identifica no totem, responde questionários e mede peso/bioimpedância, oximetria e pressão com aparelhos Bluetooth (BLE). O histórico fica num banco central, compartilhado por todas as cabines.

| Pasta | Papel |
|---|---|
| `cabine-core/` | API FastAPI, acesso ao Postgres, Bluetooth |
| `cabine-web/` | SPA React: totem (usuário) e painel (operador/admin) no mesmo app |
| `scripts/` | `dev.ps1`: sobe Postgres, API e os dois totens |
| `.cursor/` | Specs, rules e demais artefatos de desenvolvimento (este conjunto) |

Repositório: `https://github.com/cgarciia/cabine`. Branch de integração: `develop`; produção: `main` (ver `../rules/04-git-pr-commits.mdc`).

## 2. Quem usa

| Perfil | Entrada | Onde | O que faz |
|---|---|---|---|
| Usuário do totem (`users`) | Matrícula + data de nascimento | `/`, `/matricula`, `/menu`… | Faz o exame, vê relatório e registros próprios |
| Admin (`admins`) | E-mail + senha | `/admin/*` | Pareia aparelhos, cadastra/consulta usuários, opera avaliação assistida, renomeia a cabine |
| Anônimo (planejado, ver `03-fluxos.md`) | Sem login | Totem | Mede sem gravar |
| Profissional de saúde (planejado) | E-mail + senha | `cabine-profissional` | Consulta histórico; só requisitos, sem código (`anexos/requisitos-portal-profissional.md`) |

## 3. Módulos de exame

| Módulo (`slug` do cardápio) | O que mede | Aparelho | Rota do totem |
|---|---|---|---|
| `questionario` | Saúde geral (`health`) e saúde mental (`mental`) | — | `/saude-geral`, `/saude-mental` |
| `bioimpedancia` | Peso + BIA | Balança RM-RD2504A | `/bioimpedancia` |
| `oximetria` | SpO2 e pulso | Oxímetro PC-60NW / Yonker YK-81C | `/oximetro` |
| `pressao` | Pressão de braço (+ ECG opcional por microfone) | OMRON HEM-7530T | `/pressao` |
| `pressao` (pulso) | Pressão de pulso | OMRON HEM-6161T2 | `/pressao-pulso` |
| `temperatura` | Temperatura | — (ainda sem tela) | — |

## 4. Dois MVPs ao mesmo tempo

Um único processo de API (`:8000`) atende todos os módulos. O recorte de MVP existe **só na tela**: cada porta do Vite carrega um modo e mostra um cardápio.

| | MVP 1 | MVP 2 |
|---|---|---|
| Modo Vite | `mvp1` (`.env.mvp1`, `VITE_MVP_VERSION=1`) | `mvp2` (`.env.mvp2`, `VITE_MVP_VERSION=2`) |
| Porta | `https://127.0.0.1:5173` | `https://127.0.0.1:5174` |
| Módulos | questionário, bioimpedância, oximetria | temperatura (sem tela), pressão, oximetria |

- Lista em `cabine-web/src/config/mvp.ts` (`activeModules` / `hasModule`). Menu, rotas e etapas da visita usam essa lista.
- A API **não** ganha `MVP_VERSION`. Não criar segundo uvicorn para separar módulo: o rádio BLE é um só (`ble_radio_lock`).
- As duas portas são origens diferentes: `cabine.token` de uma não apaga o da outra.
- Direção da arquitetura multi-cabine: o cardápio passa a vir de `cabins.modules` (hoje a coluna existe com default; a tela ainda usa `mvp.ts`).

## 5. Idiomas

| Coisa | Idioma |
|---|---|
| Identificadores (código, tabelas, colunas, paths REST, chamadas HTTP) | Inglês |
| JSON da API | `snake_case` |
| `detail` de erro, texto de UI, textos clínicos | Português |
| Rotas da SPA | Português, kebab (`/saude-mental`) |
| Commits e PRs | Português (ver rules de git) |

## 6. Glossário

| Termo | Significado |
|---|---|
| Totem / kiosk | Tela self-service da cabine |
| Operador / admin | Quem entra no painel `/admin` (`admins`) |
| Cabine (`cabins`) | PC físico com seus aparelhos |
| Aparelho (`devices`) | Equipamento BLE de uma cabine; um por tipo é o padrão (`is_default`) |
| Sessão (`sessions`) | Um exame identificado (`open` → `completed` / `abandoned`) |
| Visita | Termo legado/UX para a sessão atual no front (`visitId`, `visitScope`) |
| Rádio | O adaptador BLE do PC; um só, serializado por `ble_radio_lock` |
| BIA | Bioimpedância (composição corporal) |
| ECG ultrassônico | Traço do HEM-7530T captado por tom de ~19 kHz no microfone |

## 7. Decisões de produto vigentes

1. Banco só atrás da API central; a cabine nunca abre SQL.
2. Matrícula sem rede não autentica (exame identificado exige rede).
3. FHIR saiu do contrato; não reintroduzir sem decisão.
4. Perfis `patient` e `clinician` ficaram fora do produto (não há `src/role/`).
5. Textos de perguntas, respostas e resultados dos questionários foram definidos pelo time de saúde (Dr. Guilherme e Dr. Edu). Não alterar conteúdo clínico sem aprovação.
6. Cálculo de composição corporal é do core; o front só exibe `metrics`.
7. Impressão do relatório via `window.print()` (impressora de campo: EPSON L6270); navegador em modo quiosque.
