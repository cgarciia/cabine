# Relatório comparativo — protocolos de comunicação de balanças (Cabine)

**Data:** 08-09-2026  
**Escopo:** comparar os dispositivos do estudo (Relaxmedic Branca, TopHouse e RelaxMedic 8 sensores), documentar os protocolos e a stack técnica usada no Cabine, e indicar **melhores parâmetros** para a pesquisa comparativa.

---

## 1. Resumo executivo

Atualmente o Cabine integra **dois protocolos BLE** em desenvolvimento. O estudo compara esses dois com uma terceira balança (RelaxMedic 8 sensores).

| Origem da referência | Dispositivo | MAC | Status no Cabine |
|---|---|---|---|
| Teams (2º link) | **Tipo A — GATT** | `A8:0B:6B:95:EC:79` | Integrado (`ble_gatt`) |
| Teams (último link) | **Tipo B — Broadcast** | `78:66:A5:57:8E:B7` | Integrado (`ble_broadcast`, padrão) |
| Mercado Livre (1º link) | **RelaxMedic 8 sensores** | `60:65:F4:CA:05:77` | Candidata — ainda não no código |

**Leitura de negócio:** Tipo A e Tipo B resolvem **peso em tempo real** na cabine. A RelaxMedic 8 sensores é o candidato de **BIA mais completa** (8 eletrodos, dual frequency), porém com protocolo de app proprietário (Fitdays/RelaxFit) e maior esforço de engenharia.

---

## 2. Mapeamento das fontes (corrigido)

| # | Fonte | Dispositivo |
|---|---|---|
| 1 | [Mercado Livre — MLB64134227](https://www.mercadolivre.com.br/balanca-de-bioimpedancia-8-sensores-relaxmedic-digital-preto/p/MLB64134227) | RelaxMedic 8 sensores — MAC **`60:65:F4:CA:05:77`** |
| 2 | Teams (mensagem `...7834176`) | **Tipo A (GATT)** — já no código |
| 3 | Teams (mensagem `...7848599`, último link) | **Tipo B (Broadcast)** — já no código |

---

## 3. Dispositivos do estudo

### 3.1 Tipo A — BLE GATT (já no código)

| Campo | Valor |
|---|---|
| Nome no sistema | Balança Tipo A (GATT) |
| Referência Teams | 2º link |
| Adapter | `ble_gatt` |
| Parser | `gatt_16bit_overflow` |
| MAC | `A8:0B:6B:95:EC:79` |
| Código | `adapters/ble_gatt.py`, `parsers.py` |

**Protocolo**

1. Scan BLE por MAC (`BleakScanner.find_device_by_address`).
2. Conexão GATT (no Windows: filtros de serviço + tolerância a falhas de descritores WinRT).
3. Notify em characteristics:
   - Preferencial OEM: serviço `FFF0`, char `FFF1`
   - Fallback: Weight Scale `181D` / `2A9D`
4. Parser AC27 (Yolanda/QN):
   - Hex inicia com `ac27`, comprimento ≥ 40 nibbles
   - ADC em `hex[8:12]`; peso ≈ `adc/1000`, com correção de overflow 16-bit (+65.536)

**Entrega atual:** peso (kg) via WebSocket.  
**Não entrega hoje:** impedância bruta / BIA completa.

**Prós:** canal dedicado; família QingNiu/Yolanda conhecida.  
**Contras:** sessão GATT no Windows é mais frágil; ocupa o rádio Bluetooth.

---

### 3.2 Tipo B — BLE Broadcast (já no código)

| Campo | Valor |
|---|---|
| Nome no sistema | Balança Tipo B (Broadcast) |
| Referência Teams | Último link |
| Adapter | `ble_broadcast` |
| Parser | `broadcast_big_endian` |
| MAC | `78:66:A5:57:8E:B7` |
| Código | `adapters/ble_broadcast.py`, `parsers.py` |

**Protocolo**

1. `BleakScanner` com callback de advertising.
2. Filtro pelo MAC.
3. `manufacturer_data`: remove 6 bytes finais; **2 primeiros bytes big-endian / 100** → kg.

**Entrega atual:** peso passivo, sem pareamento.  
**Prós:** simples, estável, ideal para kiosk.  
**Contras:** em geral só peso; BIA costuma exigir GATT + handshake.

---

### 3.3 RelaxMedic 8 sensores (candidata)

| Campo | Valor |
|---|---|
| Referência | Mercado Livre MLB64134227 |
| MAC informado | **`60:65:F4:CA:05:77`** |
| Família comercial | RelaxMedic bioimpedância 8 sensores (Bodyscan Pro / Vision / similares) |
| App | Fitdays / RelaxFit |
| BIA | Dual frequency **20 kHz + 100 kHz**, 8 eletrodos (4 pés + 4 mãos) |
| Capacidade típica | 6–180 kg |
| Status Cabine | **Não integrada** |

**Protocolo (estado do conhecimento)**

| Camada | Situação |
|---|---|
| Transporte | BLE |
| App oficial | Fitdays / RelaxFit (obrigatório para BIA completa, segundo o fabricante) |
| GATT esperado (OEM QN) | `FFF0` + notify `FFF1` + write `FFF2` (variantes `FFE0` / handshake `AE00`) |
| Advertising | Algumas QN também broadcastam peso (caminho similar ao Tipo B) |
| BIA segmentada | Proprietária; frequentemente calculada no SDK/app |
| Integração PC | Sem SDK público oficial — exige RE (nRF Connect) e/ou SDK QingNiu |

**Próximo passo técnico sugerido:** capturar advertising + GATT desse MAC `60:65:F4:CA:05:77` com nRF Connect e classificar se o caminho de peso é broadcast, GATT AC27/`FFF1`, ou ambos.

---

## 4. Comparativo lado a lado

| Critério | Tipo A (GATT) | Tipo B (Broadcast) | RelaxMedic 8 sensores |
|---|---|---|---|
| Fonte | Teams #2 | Teams #3 (último) | ML + MAC `60:65:F4:CA:05:77` |
| No código Cabine | Sim | Sim | Não |
| Protocolo | GATT notify | Advertising | GATT (+ app); advertising a confirmar |
| Pareamento | Sim | Não | Sim (app); PC a validar |
| Peso | Sim | Sim | A integrar |
| BIA nativa | Não (hoje) | Não | Potencial alto |
| Sensores | Tipicamente 4 (pés)* | Tipicamente 4 (pés)* | **8 (pés + mãos)** |
| Freq. BIA | Depende do modelo | N/A no fluxo atual | **20 + 100 kHz** |
| Estabilidade Windows | Média (mitigada) | Alta | A avaliar |
| Esforço integração | Já feito | Já feito | Alto |
| Risco lock-in OEM | Médio | Baixo | Alto |

\* Inferência de família; confirmar por inspeção física / nRF Connect.

---

## 5. Stack técnica do Cabine (recursos utilizados)

Sim — vale documentar. Abaixo o que o projeto usa hoje, o que é recomendado manter e quais alternativas existem.

### 5.1 Arquitetura de ponta a ponta

```
Balança BLE  →  Bleak (Python)  →  Adapter (gatt|broadcast)
                                      ↓
                               stream_scale (FastAPI)
                                      ↓
                            WebSocket /ws/scale
                                      ↓
                         Frontend React (cabine-web)
```

| Camada | Tecnologia | Onde |
|---|---|---|
| Backend API | **FastAPI** + **Uvicorn** | `cabine-core` |
| Canal tempo real | **WebSocket** (`/ws/scale?scale_id=...`) | `app/api/routes/scale.py`, `stream.py` |
| BLE | **Bleak ≥ 3.0.2** (WinRT no Windows) | `adapters/ble_*.py` |
| Persistência de cadastro | PostgreSQL + SQLAlchemy async | tabela `scales` |
| Frontend | React + Vite; `WebSocket` nativo do browser | `ScalePage.tsx` |
| Mensagens WS | JSON: `STATUS`, `PESO_RECEBIDO` | contrato front/back |

### 5.2 Por que WebSocket

| Opção | Adequação ao caso | Comentário |
|---|---|---|
| **WebSocket (escolhido)** | **Alta** | Peso chega de forma assíncrona e contínua; push do servidor sem polling |
| SSE (Server-Sent Events) | Média | Bom para push unidirecional; menos natural se o front precisar enviar comandos |
| HTTP polling | Baixa | Atraso e carga desnecessários para “ao vivo” |
| gRPC streaming | Média/alta em backends | Overkill para o browser atual; exigiria proxy/grpc-web |
| MQTT | Média | Útil em IoT multi-device; adiciona broker operacional |

**Recomendação:** manter **WebSocket**. Encaixa no kiosk (1 cliente ↔ 1 stream de balança) e já está estável com o ciclo de vida corrigido (fechar WS encerra o adapter BLE).

### 5.3 Por que Bleak

| Critério | Bleak | Observação |
|---|---|---|
| Async nativo (`asyncio`) | Sim | Casa com FastAPI |
| Windows 10/11 | Sim (WinRT) | Usado na cabine |
| Scan + GATT client | Sim | Cobre Tipo A e Tipo B |
| Comunidade / docs | Forte | Padrão de fato em Python BLE |
| Maturidade no projeto | Já adotado (`bleak>=3.0.2`) | Com mitigações WinRT próprias |

**Recomendação:** **continuar com Bleak** como biblioteca principal. É a opção mais alinhada a FastAPI/async e à stack atual. Os problemas encontrados (descritores WinRT, concorrência de rádio) são conhecidos e já mitigados no código (`ble_winrt_patch`, `ble_radio_lock`, filtro de serviços).

### 5.4 Alternativas BLE (quando considerar)

| Biblioteca / abordagem | Prós | Contras | Quando usar |
|---|---|---|---|
| **Bleak (atual)** | Async, multiplataforma, scan+GATT | Quirks WinRT | **Default recomendado** |
| **SimplePyBLE** | API limpa, multi-linguagem | Licença comercial para uso proprietário em alguns cenários; menos “nativa” ao estilo asyncio do FastAPI | Se Bleak falhar de forma recorrente no hardware alvo |
| **Bumble** | Stack BLE completa em Python; bom para testes/emulação | Mais complexa; overhead | Lab, fuzzing, proxy HCI |
| **pc-ble-driver-py (Nordic)** | Controle fino com dongle nRF | Exige hardware Nordic + build nativo | Produção com dongle dedicado, isolando o Bluetooth do Windows |
| **Web Bluetooth (browser)** | Sem backend BLE | Chrome/Edge only; UX de permissão; ruim para kiosk headless | Protótipo web-only, não cabine Windows de fundo |
| **SDK nativo WinRT/C#** | Máximo controle no Windows | Quebra o monorepo Python; dois runtimes | Último recurso se só WinRT nativo estabilizar um modelo |

**Recomendação prática para o estudo RelaxMedic (`60:65:F4:CA:05:77`):**

1. Primeiro spike **ainda em Bleak** (mesmo adapter pattern `ble_gatt` / `ble_broadcast`).
2. Se a BIA exigir handshake/write proprietário estável e o WinRT atrapalhar, avaliar **dongle Nordic + pc-ble-driver** ou **SimplePyBLE** como plano B — sem trocar a camada WebSocket/FastAPI.

### 5.5 Outros recursos relevantes no Cabine

| Recurso | Uso |
|---|---|
| `ble_radio_lock` | Serializa scan GATT vs broadcast no mesmo adaptador |
| `watch_websocket_closed` | Evita travar o uvicorn quando o front fecha a sessão |
| Sessão DB curta no WS | Carrega a balança e libera o pool antes do stream BLE longo |
| Registry de adapters/parsers | Permite cadastrar novos dispositivos sem reescrever o front |
| Estimativas antropométricas (front) | IMC, % gordura (Deurenberg), água (Watson), TMB — **não substituem BIA elétrica** |

---

## 6. Melhores parâmetros para o estudo comparativo

### 6.1 Produto / clínica

| Parâmetro | Por quê |
|---|---|
| Peso (kg) e tempo até estabilizar | UX da cabine |
| Repetibilidade (3× no mesmo sujeito) | Confiabilidade |
| IMC | Já calculável no Cabine |
| % gordura / massa magra / água / visceral / segmentos | Diferencial da RelaxMedic 8 sensores |
| Necessidade de perfil (sexo, idade, altura) | Impacto no fluxo |

### 6.2 Comunicação / engenharia

| Parâmetro | Tipo A | Tipo B | RelaxMedic `60:65:F4:CA:05:77` |
|---|---|---|---|
| Latência até 1º pacote | Medir | Medir | Medir |
| Taxa de falha no Windows | Crítico | Baixo esperado | Crítico |
| Sessão estável (min) | Medir | N/A | Medir |
| Conflito de rádio BLE | Com lock | Com lock | Medir |
| Payload hex documentado | AC27 parcial | BE/100 | **Capturar** |
| Impedância bruta no fio | Verificar | Não | Meta |
| Dependência de write/handshake | Parcial | Não | Provável |

### 6.3 Negócio / operação

| Parâmetro | Relevância |
|---|---|
| Custo e disponibilidade | Já compradas A/B; RelaxMedic via ML |
| Homologação Anatel | Presente nos manuais RelaxMedic |
| Uso profissional | Fabricante desaconselha alguns modelos Bodyscan para consultório |
| Lock-in de app | Alto em Fitdays/RelaxFit |
| Manutenção no monorepo | A/B no registry; RelaxMedic seria novo adapter |

### 6.4 Roteiro sugerido do estudo

1. **Identidade BLE** — nRF Connect nos três MACs (`A8:0B:…`, `78:66:…`, `60:65:F4:CA:05:77`).
2. **Peso** — N ciclos, 3 medições; erro médio, CV%, tempo até estável.
3. **Composição** — RelaxMedic (app) vs estimativas antropométricas do Cabine (métodos diferentes; declarar isso).
4. **Spike integração PC** — peso no Cabine via Bleak; depois BIA se o payload permitir.
5. **Scorecard** (exemplo): estabilidade 30%, esforço eng. 25%, riqueza BIA 20%, custo 15%, risco OEM 10%.

---

## 7. Conclusões e recomendação

1. **Tipo B (Broadcast)** — melhor default de cabine para peso contínuo; confirmação: **último link Teams**.
2. **Tipo A (GATT)** — caminho para hardware que exige sessão/notify AC27; confirmação: **2º link Teams**.
3. **RelaxMedic 8 sensores (`60:65:F4:CA:05:77`)** — melhor candidato de **valor clínico BIA**; integrar como novo adapter após captura BLE, preferencialmente **reusando Bleak + WebSocket**.
4. **Stack:** manter **FastAPI + WebSocket + Bleak**; só mudar a lib BLE se o spike da RelaxMedic provar bloqueio estrutural no WinRT.
5. No estudo, priorize **estabilidade Windows + repetibilidade + esforço de integração + qualidade da BIA**, não só “número de sensores no folder”.

---

## 8. Referências

- Código: `cabine-core/app/services/scale/adapters/*`, `parsers.py`, `stream.py`, `pyproject.toml` (`bleak>=3.0.2`)
- Bleak docs: https://bleak.readthedocs.io/
- QingNiu/Yolanda custom BLE: https://yolandaqingniu.github.io/en/flow/ble_scale_custom_connect.html
- RelaxMedic Bodyscan / manuais RM-BD0015A, RM-BD2305A
- Anúncio ML: https://www.mercadolivre.com.br/balanca-de-bioimpedancia-8-sensores-relaxmedic-digital-preto/p/MLB64134227

---

## 9. Pendências

- [x] Mapear Teams #2 → Tipo A e Teams #3 → Tipo B
- [x] Registrar MAC RelaxMedic `60:65:F4:CA:05:77`
- [ ] Captura nRF Connect desse MAC (serviços, manufacturer data, nomes)
- [ ] Confirmar SKU exato (Bodyscan Pro vs Vision vs outro preto 8 sensores)
- [ ] Decidir se o Cabine precisa de impedância bruta ou basta peso + estimativas
