# Requisitos do Sistema

**Sistema:** Portal do Profissional de Saúde (`cabine-profissional`)  
**Contexto:** Consulta/leitura das avaliações realizadas na Cabine (totem), consumindo o mesmo backend `cabine-core`.  
**Escopo deste documento:** requisitos de negócio, funcionais, não funcionais, dados, acesso, histórico e integração.  
**Fora de escopo neste momento:** implementação de código, novas telas, banco ou APIs além do que for necessário registrar como requisito.

**Base analisada:** monorepo Cabine (`cabine-core`, `cabine-web`, `cabine-profissional`) e `cabine-profissional/SPEC-portal-profissional.md`.

---

## 1. Visão geral

O Portal do Profissional é uma aplicação web separada do totem/painel do operador. Ele permite que profissionais autenticados:

- façam cadastro e login;
- consultem pacientes (`people`) que realizaram avaliações na Cabine;
- visualizem o histórico de avaliações (visitas) e os resultados associados;
- comparem avaliações de períodos diferentes, usando dados já existentes.

Não duplica o domínio clínico: pacientes e avaliações permanecem nas tabelas atuais do `cabine-core`. O portal é predominantemente leitura sobre dados gerados no totem/operador.

---

## 2. Regras de Negócio


| ID   | Regra                                                                                                                                                                                                                                                                                                                                                               | Origem / status                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| RN01 | O portal consome o mesmo backend e banco da Cabine (`cabine-core` / PostgreSQL). Não há segundo banco clínico.                                                                                                                                                                                                                                                      | Spec / arquitetura atual                     |
| RN02 | Pacientes do portal são os registros da tabela `people` (não criar entidade `Paciente` paralela).                                                                                                                                                                                                                                                                   | Modelo existente                             |
| RN03 | Avaliações/visitas são agregações lógicas de registros que compartilham `visit_id` (BIA, oximetria, pressão, questionários). Não há tabela obrigatória `visits` na v1. ++**precisa ter tabela pra isso mesmo que futuramente ? se sim adicione isso como uma regra agora! ter uma tabela de visitas**++                                                             | Modelo / serviço de visitas                  |
| RN04 | Medições e questionários são gerados na Cabine (totem). O portal profissional não cria, edita nem exclui registros clínicos.                                                                                                                                                                                                                                        | Spec aprovada                                |
| RN05 | Profissional autenticado (`role=professional`) não cadastra, edita nem exclui pacientes no portal na v1 (gestão/cadastro de pacientes prevista para avaliação em novos papéis). ++**precisa dizer que vai existir papeis, que vao possuir niveis de permição alguns desses usuarios admin vao poder excluir ou alterar ou cadastras dados de pacientes usuarios**++ | validar                                      |
| RN06 | Profissional autenticado pode visualizar todos os pacientes da Cabine (sem vínculo paciente – profissional na v1).                                                                                                                                                                                                                                                  | validar com cliente se permanece             |
| RN07 | Cadastro de profissional é self-service (aberto), sem fluxo de aprovação na v1.                                                                                                                                                                                                                                                                                     | validar com cliente se permanece             |
| RN08 | No cadastro profissional é obrigatório CRM, nome, e-mail e senha.                                                                                                                                                                                                                                                                                                   | validar se vale para todos os perfis futuros |
| RN09 | Autenticação do portal usa e-mail + senha, reutilizando a tabela `users` com `role=professional`.                                                                                                                                                                                                                                                                   | Modelo / API existentes                      |
| RN10 | Operador da Cabine (`role=operator`) continua no painel `cabine-web`; o portal profissional aceita apenas perfil profissional (salvo decisão futura de papéis adicionais).                                                                                                                                                                                          | Spec / código                                |
| RN11 | Comparação entre avaliações usa apenas dados já persistidos (peso/BIA metrics, SpO₂, PA, payloads de questionários). Não inventar indicadores clínicos novos sem especificação.                                                                                                                                                                                     | Escopo deste documento                       |
| RN12 | Registros legados sem `visit_id` podem ser agrupados por janela temporal (regra já usada na Cabine: ~45 min).                                                                                                                                                                                                                                                       | Serviço de visitas existente                 |
| RN13 | Senha de profissional é armazenada apenas como hash; não em texto puro.                                                                                                                                                                                                                                                                                             | Prática atual do core                        |
| RN14 | *(A validar)* Podem existir outros papéis (administrativo, enfermeiro, gestor, RH) com permissões distintas. Enquanto não definidos, o sistema considera o papel profissional descrito neste documento.                                                                                                                                                             | Perguntas em aberto                          |


---

## 3. Requisitos Funcionais


| ID   | Requisito                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF01 | Autenticar profissional com e-mail e senha, emitindo sessão/token de acesso.                                                                                                    |
| RF02 | Cadastrar profissional com nome, e-mail, CRM e senha, com login imediato após sucesso.                                                                                          |
| RF03 | Encerrar sessão (logout) e impedir acesso às telas protegidas sem autenticação válida.                                                                                          |
| RF04 | Consultar lista de pacientes que possuem cadastro/avaliações na Cabine, com busca e paginação.                                                                                  |
| RF05 | Visualizar dados cadastrais de um paciente (perfil).                                                                                                                            |
| RF06 | Visualizar histórico de avaliações (visitas) de um paciente, ordenado por data/hora.                                                                                            |
| RF07 | Visualizar o detalhe/resultados de uma avaliação (conteúdo agregado da visita).                                                                                                 |
| RF08 | Selecionar avaliações de períodos diferentes e comparar resultados lado a lado (limite e campos: ver seção Histórico e Resultados - *pensar na melhor maneira de exibir isso*). |
| RF09 | Exibir, quando existirem na visita, resultados de: bioimpedância (peso + metrics), oximetria, pressão arterial e questionários (saúde geral / saúde mental).                    |
| RF10 | Restringir o portal a usuários com papel profissional (ou papéis futuros aprovados); negar uso do portal por token de paciente do totem.                                        |
| RF11 | *(A validar)* Gerenciar usuários/profissionais (listar, editar, ativar/desativar, excluir) por um perfil administrativo.                                                        |
| RF12 | *(A validar)* Exportar ou imprimir relatório de histórico/comparação.                                                                                                           |
| RF13 | *(A validar)* Recuperação de senha do profissional.                                                                                                                             |


---

## 4. Requisitos Não Funcionais


| ID    | Requisito                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF01 | Autenticação baseada em token (JWT), alinhada ao `cabine-core`.                                                                                                        |
| RNF02 | Controle de acesso por papel (`role`): profissional com permissão de leitura clínica; mutações de paciente/dispositivo/FHIR permanecem fora do escopo do profissional. |
| RNF03 | Proteção de dados de pacientes: comunicação via HTTPS em ambientes de uso; senhas com hash; sem exposição desnecessária de credenciais.                                |
| RNF04 | Desempenho adequado para listagem paginada de pacientes e histórico de visitas (sem carregar “todos os registros do sistema” de uma vez na UI).                        |
| RNF05 | Usabilidade: interface legível para consulta dos dados, consistente com a identidade do produto Cabine.                                                                |
| RNF06 | Disponibilidade: o portal depende do `cabine-core` e do PostgreSQL estarem acessíveis.                                                                                 |
| RNF07 | Manutenibilidade: reutilizar contratos e agregações já existentes no core; evitar duplicar lógica de BIA/scoring no portal.                                            |
| RNF08 | Auditoria/logs de quem visualizou ou alterou dados de pacientes/profissionais.                                                                                         |
| RNF09 | Política de retenção e anonimização de dados (LGPD / conformidade).                                                                                                    |
| RNF10 | Requisitos de acessibilidade e suporte a múltiplos dispositivos (desktop/tablet).                                                                                      |


---

## 5. Dados

### 5.1 Dados do profissional (cadastro / sessão)


| Dado                        | Obrigatório (v1) | Observação                                                         |
| --------------------------- | ---------------- | ------------------------------------------------------------------ |
| Nome completo (`full_name`) | Sim              | Extensão de `users`                                                |
| E-mail                      | Sim              | Único; login                                                       |
| CRM                         | Sim              | Obrigatório no cadastro profissional; operadores podem não ter CRM |
| Senha                       | Sim              | Armazenada como hash (`hashed_password`)                           |
| Papel (`role`)              | Sim (sistema)    | Valor `professional` no portal                                     |
| Ativo (`is_active`)         | Sim (sistema)    | Conta desativada não autentica                                     |




### 5.2 Dados do paciente consultados a partir da Cabine (`people`)


| Dado                      | Campo                |
| ------------------------- | -------------------- |
| Identificador             | `id` (UUID)          |
| Nome                      | `name`               |
| Matrícula                 | `registration`       |
| Altura                    | `height_cm`          |
| Idade                     | `age`                |
| Data de nascimento        | `birth_date`         |
| Sexo                      | `sex`                |
| Tipo corporal             | `people_type`        |
| Peso esperado (se houver) | `expected_weight_kg` |


**Não existem hoje** em `people` (não inventar no portal): CPF, telefone, e-mail do paciente, foto, vínculo com empresa/RH.

### 5.3 Dados de avaliação (por visita / tipo de registro)


| Tipo                      | Fonte                                | Exemplos de campos já existentes                                                                                                      |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Bioimpedância             | `scale_measurements`                 | `weight_kg`, `metrics` (JSONB: IMC, gordura, água, músculo, etc.), `impedances_ohm`, `segments`, `complete`, `created_at`, `visit_id` |
| Oximetria                 | `oximeter_readings`                  | `spo2_pct`, `pulse_bpm`, `pi_pct`, `waveform`, `stable`, `created_at`, `visit_id`                                                     |
| Pressão arterial          | `blood_pressure_readings`            | `sys_mmhg`, `dia_mmhg`, `pulse_bpm`, `movement`, `irregular_heartbeat`, `measured_at`, `visit_id`                                     |
| Questionário saúde geral  | `form_submissions` (`module=health`) | `status`, `payload` (JSONB), `created_at`, `visit_id`                                                                                 |
| Questionário saúde mental | `form_submissions` (`module=mental`) | `status`, `payload` (JSONB), `created_at`, `visit_id`                                                                                 |


**Nota:** ECG do monitor de pressão, quando captado no totem via áudio, **não** está modelado como tabela própria no core no mesmo formato das leituras acima. Tratar eventual exibição no portal como **dúvida** até haver contrato de persistência.

---

## 6. Controle de Acesso

### 6.1 Situação atual (código / spec)


| Papel                   | Onde atua                    | Pacientes                       | Avaliações               | Profissionais             | Dispositivos / FHIR  |
| ----------------------- | ---------------------------- | ------------------------------- | ------------------------ | ------------------------- | -------------------- |
| `professional`          | Portal                       | Visualizar (todos)              | Visualizar / comparar    | Self-cadastro próprio     | Sem acesso           |
| `operator`              | Painel Cabine (`cabine-web`) | CRUD conforme rotas de operador | Opera medições na Cabine | Não é o público do portal | Sim (conforme rotas) |
| Paciente (`typ=person`) | Totem                        | Próprio escopo                  | Própria sessão           | Não                       | BLE via totem        |




### 6.2 Papéis adicionais a avaliar (ainda não definidos no sistema)


| Perfil sugerido (cliente) | Status                                                          |
| ------------------------- | --------------------------------------------------------------- |
| Administrativo            | Em aberto                                                       |
| Enfermeiro                | Em aberto — pode coincidir com `professional` ou ser papel novo |
| Gestor                    | Em aberto                                                       |
| RH                        | Em aberto                                                       |




### 6.3 Matriz de ações (v1)


| Ação                                   | Profissional (v1) | Admin / RH / Gestor / Enfermeiro      |
| -------------------------------------- | ----------------- | ------------------------------------- |
| Login no portal                        | Sim               | A validar                             |
| Cadastrar a si mesmo                   | Sim               | A validar (convite? aprovação?)       |
| Listar / ver pacientes                 | Sim               | A validar escopo (todos vs. filtrado) |
| Cadastrar / editar / excluir pacientes | Sim               | A validar                             |
| Ver histórico e resultados             | Sim               | A validar                             |
| Comparar avaliações                    | Sim               | A validar                             |
| Gerenciar outros profissionais         | Não (v1)          | A validar                             |
| Editar / excluir profissionais         | Não (v1)          | A validar                             |
| Exportar relatórios                    | Não definido      | A validar                             |
| Auditoria de acesso                    | Não definido      | A validar                             |


---

## 7. Histórico e Resultados

### 7.1 Apresentação do histórico


| ID   | Requisito                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RH01 | Listar visitas do paciente em ordem cronológica (mais recente primeiro).                                                                                                                 |
| RH02 | Cada item do histórico deve identificar data/hora da visita e quais módulos existem (ex.: BIA, SpO₂, PA, questionários).                                                                 |
| RH03 | Ao abrir uma visita, exibir os resultados disponíveis daquele agrupamento (`VisitBundle`).                                                                                               |
| RH04 | Permitir selecionar até N visitas para comparação (comportamento já previsto na UI do portal em construção: seleção múltipla). **Confirmar N com o cliente** (hoje a UI menciona até 4). |




### 7.2 Comparação entre avaliações

Podem ser comparados apenas dados já existentes nas visitas selecionadas, por exemplo:


| Domínio          | Exemplos comparáveis (se presentes nas visitas)                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bioimpedância    | Peso (`weight_kg`); indicadores em `metrics` já gravados (ex.: IMC, gordura %, água, músculo — conforme payload salvo) |
| Oxigenação       | `spo2_pct`, `pulse_bpm`, `pi_pct`                                                                                      |
| Pressão arterial | `sys_mmhg`, `dia_mmhg`, `pulse_bpm`                                                                                    |
| Questionários    | Campos/resultados presentes no `payload` salvo (score/label/answers, conforme módulo)                                  |


**Não definir neste documento:** faixas clínicas novas, diagnósticos, “evolução percentual” padronizada ou gráficos obrigatórios que não estejam especificados. Isso deve ser validado com o time de saúde/cliente.

### 7.3 Períodos no histórico


| ID   | Requisito / dúvida                                                                                |
| ---- | ------------------------------------------------------------------------------------------------- |
| RH05 | Exibir o histórico completo disponível no banco, com paginação.                                   |
| RH06 | Filtros por período (ex.: últimos 30/90 dias), exportação ou limite máximo de visitas retornadas. |


---



## 8. Integração com a Cabine



### 8.1 Princípios


| ID   | Requisito                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RI01 | Integração direta via HTTP com `cabine-core` (mesma API da Cabine).                                                                                               |
| RI02 | Autenticação JWT de usuário (`typ=user`) com `role=professional`.                                                                                                 |
| RI03 | Não duplicar tabelas de paciente nem de avaliações.                                                                                                               |
| RI04 | Não usar WebSockets BLE no portal (fora do escopo de consulta).                                                                                                   |
| RI05 | Preferir endpoints já existentes; criar/estender contratos só quando faltar capacidade (ex.: perfil por id, visitas agregadas, paginação, registro profissional). |




### 8.2 Capacidades de API relevantes (reuso / extensão)


| Necessidade           | Situação                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Login                 | `POST /login`                                                                              |
| Cadastro profissional | `POST /professionals/register`                                                             |
| Sessão                | `GET /users/me`                                                                            |
| Lista de pacientes    | `GET /people` (com busca/paginação conforme contrato do core)                              |
| Perfil do paciente    | `GET /people/{id}`                                                                         |
| Históricos por tipo   | `GET /people/{id}/measurements`, `/forms`, `/oximeter`, `/blood-pressure` (e equivalentes) |
| Visitas agregadas     | `GET /people/{id}/visits`                                                                  |




### 8.3 O que a integração **não** faz na v1

- Sincronização offline / fila  
- Segundo banco ou ETL  
- Escrita de medições pelo portal  
- Exposição de rotas de dispositivos, FHIR ou mutação (cadastro/edição/exclusão) de pacientes ao profissional

---



## 9. Dúvidas / Perguntas em Aberto

Respostas necessárias antes de fechar escopo de papéis, permissões e entregas extras:

1. Quem utilizará o sistema: administrativo, enfermeiro, gestor, RH, médico ou outros?
2. Quais perfis de acesso existirão além de `professional`?
3. Quais ações cada perfil poderá realizar (visualizar, cadastrar, editar, excluir profissionais; visualizar pacientes; exportar)?
4. Quem pode editar ou excluir profissionais?
5. Quem pode visualizar os dados dos pacientes? Continua “todos os pacientes” ou haverá vínculo/filtro por unidade/empresa?
6. O CRM será obrigatório para **todos** os profissionais (incluindo enfermeiro/RH, se existirem)?
7. O cadastro continuará aberto (self-service) ou passará a exigir convite/aprovação?
8. Quais dados dos pacientes poderão ser visualizados além dos campos atuais de `people`? Haverá CPF, contato, empresa?
9. Quais dados **exatos** deverão aparecer na comparação (lista fechada de métricas BIA / campos de questionário)?
10. Como os resultados devem ser apresentados (cards, tabela, gráfico)? Há layout/aprovação do time de saúde?
11. Quais períodos de avaliação devem aparecer no histórico (tudo, ou filtros padrão)?
12. Quantas avaliações podem ser comparadas ao mesmo tempo (confirmar limite, ex.: 4)?
13. Existe necessidade de gerar ou exportar relatórios (PDF/Excel/impressão)?
14. Existe necessidade de registrar quem visualizou ou alterou informações (auditoria)?
15. O mesmo e-mail pode ser operador da Cabine e profissional do portal?
16. ECG / traçado do monitor de pressão deve aparecer no portal? Se sim, onde fica persistido hoje?
17. Há requisitos legais (LGPD, termo de consentimento, retenção) específicos para o portal?
18. Nome comercial / branding definitivo do portal?

---



## 10. Referências internas


| Artefato                                                                                                                         | Uso                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `cabine-profissional/SPEC-portal-profissional.md`                                                                                | Spec técnica e decisões já aprovadas |
| `cabine-core` models `users`, `people`, `scale_measurements`, `oximeter_readings`, `blood_pressure_readings`, `form_submissions` | Fonte de dados                       |
| `cabine-core` serviço de visitas / `GET /people/{id}/visits`                                                                     | Agregação de histórico               |
| `cabine-web` totem                                                                                                               | Origem das avaliações                |


---

**Documento:** requisitos v1 (somente levantamento)  
**Próximo passo sugerido:** validar a seção 9 com cliente/equipe e atualizar RN/RF/matriz de acesso com as decisões fechadas.