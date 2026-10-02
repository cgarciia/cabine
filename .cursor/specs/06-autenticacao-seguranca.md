# 06 — Autenticação e segurança

## 1. Perfis e tokens

JWT HS256 assinado com `SECRET_KEY`. O servidor não guarda sessão: qualquer processo com a mesma chave valida o token. `security.py` é o **único** lugar que emite token (`issue_person_token`, `issue_operator_token`). Token sem `typ` é rejeitado.

| Quem | Entrada | Claims | Validade (padrão) |
|---|---|---|---|
| Usuário do totem | Matrícula + data de nascimento | `sub` = UUID, `typ` = `person`, `registration` | `PERSON_TOKEN_EXPIRE_MINUTES` = 30 |
| Admin | E-mail + senha (bcrypt) | `sub` = e-mail, `typ` = `user`, lido de `admins` | `OPERATOR_TOKEN_EXPIRE_MINUTES` = 480 |

- O totem só aceita `typ=person`; o painel só aceita `typ=user`. Um token não abre as telas do outro perfil.
- `typ=person`: só lê/grava o próprio usuário. `GET /users`, DELETE usuário, CRUD de aparelhos/balanças e scans BLE exigem `typ=user`.
- Senha: `bcrypt`. A verificação roda mesmo com e-mail inexistente (tempo de resposta não revela contas).

## 2. Transporte do token

- HTTP: header `Authorization: Bearer`.
- WebSocket: query `token=`.
- Front: `cabine.token` + `cabine.token-expires-at` em `localStorage` (não é cookie httpOnly; decisão atual, ver pendências). Skew de 10 s na expiração.
- 401 fora de `/login` limpa a sessão e leva a `/matricula` ou `/admin/login`.

## 3. Rate limit de login

Em memória, por IP e por matrícula/e-mail, **contando só falhas** (todo login do totem sai do mesmo IP). Estourou → `429` + `Retry-After`.

`LOGIN_MAX_FAILURES_PER_SUBJECT` = 5, `LOGIN_MAX_FAILURES_PER_IP` = 30, janela `LOGIN_RATE_LIMIT_WINDOW_SECONDS` = 300. Vale para `/login`, `/login/registration` e `/login/lookup` (matrícula inexistente).

## 4. Rotas públicas (lista fechada)

`GET /`, `GET /health`, `GET /cabins/current`, `POST /cabins/register`, `POST /login`, `POST /login/registration`, `POST /login/lookup`, `POST /users` (cadastro do totem), `POST /admins` **somente se ainda não existir admin**.

Adicionar rota pública exige decisão explícita registrada no PR e nesta lista.

## 5. CORS

`allow_credentials=False`. Origens: `BACKEND_CORS_ORIGINS` + regex `BACKEND_CORS_ORIGIN_REGEX` (localhost, 127.0.0.1 e faixas privadas 192.168/10/172.16-31).

## 6. Segredos e dados sensíveis

- `.env` nunca vai para o git; o template é `.env.example`. `SECRET_KEY` com menos de 32 caracteres gera aviso no boot (gerar com `python -c "import secrets; print(secrets.token_urlsafe(48))"`).
- Nunca commitar senha de banco real, `SECRET_KEY` real ou MAC de aparelho de laboratório em `Settings`/`.env.example`. O MAC é escolhido na tela (e fica em `localStorage`: `cabine.oximeter-address`, `cabine.bp-address`).
- `.env.example` com valor de dev (`123456`) é aceitável **só** como placeholder local.
- Log: não registrar corpo de requisição, senha, token, nem matrícula/nome além do estritamente necessário. Sem log de debug de sessão BLE em `app/`.
- Não há `request_id` nem trilha de auditoria hoje (pendência).

## 7. Dados pessoais (LGPD)

Dados coletados: nome, matrícula, data de nascimento, idade, altura, sexo, tipo corporal, peso esperado (opcional); leituras de saúde (peso/BIA, SpO2, PA, questionários). Admin: e-mail e hash da senha.

Estado atual (ver `11-estado-e-pendencias.md`): sem termo de consentimento, sem trilha de auditoria, sem política de retenção/anonimização, `DELETE /users/{id}` só admin e recusado quando há histórico. Textos de orientação e triagem são aprovados pelo time de saúde; não sugerir diagnóstico ou aptidão sem aprovação clínica.

## 8. Checklist de segurança por mudança

- Nova rota: qual `typ` acessa? Está atrás de `get_current_user`/`require_access`/`get_scoped_user`?
- Rota com `user_id`: escopo e 404 (não vazar existência).
- Entrada de login/cadastro: rate limit aplicado?
- Nova variável sensível: entrou no `.env.example` sem valor real?
- Front: nenhum token em URL (exceto WS por query) nem em log.
