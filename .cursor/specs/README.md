# Specs da Cabine

Fonte única de documentação do projeto. Tudo que antes estava em `docs/`, `cabine-core/SPEC.md` e `cabine-web/SPEC.md` vive aqui. Os `README.md` do repositório só apontam para esta pasta.

Regra de manutenção: quem altera comportamento, contrato, modelo ou fluxo atualiza a spec correspondente **no mesmo PR** (ver `../rules/05-documentacao.mdc`).

## Índice

| Spec | Assunto | Atualizar quando |
|---|---|---|
| [01-visao-geral.md](./01-visao-geral.md) | Produto, escopo, MVPs, glossário, decisões | Muda escopo, MVP ou decisão de produto |
| [02-arquitetura.md](./02-arquitetura.md) | Máquinas, comunicação, stack, monorepo | Muda stack, topologia ou comunicação |
| [03-fluxos.md](./03-fluxos.md) | Exame identificado, anônimo, pareamento, cadastro de cabine, atualização | Muda um fluxo de ponta a ponta |
| [04-modelagem-dados.md](./04-modelagem-dados.md) | Tabelas, colunas, regras de integridade, migrations | Muda model, migration ou regra de dado |
| [05-api.md](./05-api.md) | Endpoints REST/WS, contrato, erros | Muda rota, schema ou status HTTP |
| [06-autenticacao-seguranca.md](./06-autenticacao-seguranca.md) | JWT, perfis, rate limit, CORS, segredos | Muda login, token, permissão ou segredo |
| [07-hardware-ble.md](./07-hardware-ble.md) | Rádio BLE, aparelhos, adapters, parsers | Muda aparelho, adapter ou regra de rádio |
| [08-backend.md](./08-backend.md) | Estrutura e camadas do `cabine-core` | Muda pasta, camada ou convenção do core |
| [09-frontend.md](./09-frontend.md) | Estrutura, rotas, sessão e convenções do `cabine-web` | Muda pasta, rota, sessão ou convenção do web |
| [10-ambiente-e-operacao.md](./10-ambiente-e-operacao.md) | Setup local, comandos, variáveis, qualidade, estado de infra | Muda comando, variável ou pipeline |
| [11-estado-e-pendencias.md](./11-estado-e-pendencias.md) | O que existe, o que falta, dívidas, decisões em aberto | Algo é concluído, descoberto ou adiado |

## Anexos (material de referência)

Documentos movidos de `docs/` sem reescrita de conteúdo. Cada um tem um aviso de data no topo. Não são fonte da verdade do código atual; a verdade são as specs numeradas acima.

| Anexo | Conteúdo |
|---|---|
| [anexos/requisitos-portal-profissional.md](./anexos/requisitos-portal-profissional.md) | Requisitos do portal clínico planejado (`cabine-profissional`, sem código) |
| [anexos/relatorio-protocolos-balancas.md](./anexos/relatorio-protocolos-balancas.md) | Estudo comparativo de protocolos de balanças BLE |
| [anexos/levantamento-fase-1.md](./anexos/levantamento-fase-1.md) | Formulário de levantamento da Fase 1 (25/09/2026), anterior à modelagem multi-cabine |

## Regra de precedência

Quando duas fontes divergirem: **código > specs numeradas > anexos**. Divergência encontrada é bug de documentação: corrija a spec no mesmo PR (ou registre em `11-estado-e-pendencias.md`).
