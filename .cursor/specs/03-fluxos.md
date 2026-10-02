# 03 — Fluxos

## 1. Primeira abertura: cadastro da cabine

A cabine deste PC não é "a primeira ativa". Quem diz qual é a cabine é o arquivo `cabin.json` (`machine_id` + `cabin_id`).

1. O front (`CabinGate`) chama `GET /cabins/current`.
2. `404` (sem `cabin_id` no JSON): a tela `CabinSetupPage` pede o nome da cabine.
3. `POST /cabins/register` `{ description }`: o core lê o `MachineGuid` do Windows e:
   - se já existe cabine com esse `machine_id`, reaproveita (atualiza o nome);
   - senão, se há **exatamente uma** cabine ativa sem `machine_id`, adota essa;
   - senão, cria uma nova cabine com `modules` padrão.
4. Grava o JSON; sessão e aparelho padrão passam a usar esse `cabin_id`.
5. Renomear depois: `PATCH /cabins/current` (admin) altera só o nome.

`409` se a cabine já estiver cadastrada neste PC.

## 2. Exame identificado

Exige rede.

1. A pessoa entra com matrícula e data de nascimento (`POST /login/registration`). O core local encaminha para a API; a API confere `users` e devolve JWT `typ=person`, o usuário e o `session_id` de uma sessão `open`.
2. A API abre uma `session` com `user_id` e `cabin_id`, status `open` (no máximo uma `open` por usuário).
3. No exame, o core local usa o aparelho **padrão** daquele tipo, conecta no Bluetooth e transmite a medição por WebSocket.
4. A leitura segue para a API com `user_id`, `session_id` e `device_id`. O nome e o MAC daquela hora ficam copiados na leitura.
5. Questionários seguem o mesmo caminho, sem aparelho (`POST /forms`).
6. Sem rede, o login recusa.

### 2.1 Fluxo do totem (telas)

```
/ (boas-vindas) → /matricula → /menu → [etapas] → /conclusao → /relatorio
                      ↘ /cadastro (primeiro acesso)         ↘ /registros
```

- Etapas do menu: `/saude-geral`, `/saude-mental`, `/bioimpedancia`, `/oximetro`, `/pressao`, `/pressao-pulso`, conforme `hasModule` do MVP.
- Progresso da visita fica em `KioskContext` (`sessionStorage`, `cabine.kiosk-session`). Leituras ficam presas à visita atual: menu, progresso e relatório não reaproveitam medição de outra visita.
- Encerrar/sair: `clearSession()` (kiosk) **e** `clearAccessSession()` (JWT + rascunhos). A próxima pessoa não herda o token.

### 2.2 Coleta por periférico (WebSocket)

| Etapa | WS | Persistência |
|---|---|---|
| Bioimpedância | `/ws/scale` | O front manda perfil (altura, idade, sexo, tipo, `user_id`) na query e persiste com `POST /measurements` ao receber a leitura. O core descarta repetidas (mesmo usuário, peso ±0,15 kg em 90 s) |
| Oximetria | `/ws/oximeter` | Stream grava; o front também pode `POST /oximeters` |
| Pressão de braço | `/ws/blood-pressure` | Termina com sistólica/diastólica/pulso estáveis. ECG por microfone (~19 kHz) é opcional e **não** é persistido |
| Pressão de pulso | `/ws/blood-pressure-wrist` | Só aceita leitura **desta sessão**; ignora o histórico antigo da memória do monitor |

A página **não** calcula BIA: o core devolve `metrics`.

## 3. Modo anônimo (alvo da modelagem multi-cabine)

> **Não implementado.** Não há código de modo anônimo no core nem no web. É decisão de arquitetura da modelagem multi-cabine, registrada aqui para guiar a implementação (ver `11-estado-e-pendencias.md`).

Funciona sem rede. Um link discreto na tela de matrícula abre o modo. Antes dos exames, a tela pede altura, gênero e data de nascimento (ficam só na memória da sessão). A balança usa altura, idade (calculada do nascimento) e gênero; tipo corporal `normal`. Nome e matrícula não entram.

- Cardápio: bioimpedância, oxímetro e pressão. Questionário fica de fora.
- O core lê o JSON local e conecta. **Não** cria `users`, `sessions` nem leitura. Ao sair, a memória é apagada.
- Sem aparelho padrão daquele tipo: a tela avisa "não há equipamento padrão deste tipo nesta cabine" e o Bluetooth não abre. A mesma frase vale no exame identificado.

## 4. Pareamento de aparelhos

O mesmo fluxo para balança, oxímetro, pressão de braço e pressão de pulso. Exige rede, porque o cadastro nasce na API. Feito na tela `/admin/equipamentos` (`EquipmentPage`).

1. Procurar (`POST /devices/scan` `{ kind }`) e Parear (`POST /devices/pair`).
2. A tela pergunta se aquele aparelho vira o padrão.
3. Sim: este fica `is_default = true`. O padrão anterior do mesmo tipo, **na mesma cabine**, passa a `false`. Os dois continuam cadastrados.
4. Não: fica `is_default = false` e `is_active = true`. O padrão anterior permanece.
5. A API grava `devices`. O core reescreve o JSON local.

Desativar (`is_active = false`) tira o padrão, se ele era o padrão. A linha permanece, porque leituras antigas apontam para ela.

O protocolo de cada aparelho fica no driver: a balança recebe altura, idade e sexo na hora da coleta; o monitor de pulso usa o vínculo do Bluetooth deste computador (o pareamento pede o "P" no visor e a confirmação do Windows); o oxímetro envia saturação e pulso.

## 5. Atualização (alvo)

O servidor publica um manifesto com a versão e o endereço do pacote. O atualizador do PC, com rede e com a cabine ociosa, baixa o pacote, troca o programa e reinicia. O JSON da cabine fica fora dessa pasta. A migration roda uma vez, na API, antes da versão nova. **Ainda não existe** (sem CI/CD nem instalador).

## 6. Operador (painel)

1. `/admin/login` → `POST /login` (e-mail/senha) → JWT `typ=user`.
2. `/admin/avaliacao`, `/admin/oximetria`, `/admin/pressao`, `/admin/pressao-pulso`: operação assistida por módulo (segundo `hasModule`).
3. `/admin/pessoas`: lista/edita/exclui usuários do totem e consulta histórico.
4. `/admin/balancas`: cadastro de balanças. `/admin/equipamentos`: pareamento (fluxo 4).
5. Token de operador não abre o totem e vice-versa.
